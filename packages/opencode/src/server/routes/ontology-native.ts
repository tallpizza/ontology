/**
 * Ontology data-layer routes — Neo4j graph + SQLite space persistence.
 *
 * This replaces the standalone Express ontology server.
 * AI/agent features are handled by OpenCode's own agent runtime.
 * This module only provides: spaces CRUD, graph queries, and data-layer RPC.
 */

import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import neo4j from "neo4j-driver"
import { Database } from "bun:sqlite"
import fs from "node:fs"
import path from "node:path"
import { lazy } from "../../util/lazy"
import { Log } from "../../util/log"

const log = Log.create({ service: "ontology" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GraphNode = {
  id: string
  name: string
  label: string
  properties: Record<string, unknown>
}

type GraphLink = {
  id: string
  source: string
  target: string
  type: string
}

type SpaceInfo = {
  id: string
  nodeCount: number
  current: boolean
}

type Skill = {
  name: string
  instruction: string
}

type ChatHistoryMessage = {
  role: "user" | "assistant"
  text: string
  timestamp: string
}

type SessionArchive = {
  id: string
  createdAt: string
  endedAt: string
  messages: ChatHistoryMessage[]
}

/** Persisted space metadata (data-layer only — no Agent state). */
type PersistedSession = {
  spaceId: string
  skills: Skill[]
  heartbeat: string
  basePrompt: string
  memory: string[]
  modelId: string
  // messages omitted — agent state not needed
  chatHistory: ChatHistoryMessage[]
  archives: SessionArchive[]
  threadId: string
  threadStartedAt: string
}

// ---------------------------------------------------------------------------
// Configuration (from env)
// ---------------------------------------------------------------------------

const DEFAULT_SPACE_ID = "default"

function getConfig() {
  return {
    neo4jUri: process.env.NEO4J_URI ?? "bolt://localhost:7687",
    neo4jUser: process.env.NEO4J_USER ?? "neo4j",
    neo4jPassword: process.env.NEO4J_PASSWORD ?? "password1234",
    spacesDbPath: process.env.ONTOLOGY_SPACES_DB ?? "",
  }
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _driver: ReturnType<typeof neo4j.driver> | undefined
let _db: Database | undefined
let _persistedSpaces: Record<string, PersistedSession> = {}

function resolveSpacesDbPath(): string {
  const cfg = getConfig()
  if (cfg.spacesDbPath) return cfg.spacesDbPath
  // Default: <cwd>/.pi/spaces.db
  return path.resolve(process.cwd(), ".pi", "spaces.db")
}

function getDriver() {
  if (!_driver) {
    const cfg = getConfig()
    _driver = neo4j.driver(cfg.neo4jUri, neo4j.auth.basic(cfg.neo4jUser, cfg.neo4jPassword))
    log.info("neo4j connected", { uri: cfg.neo4jUri })
  }
  return _driver
}

function getDb() {
  if (!_db) {
    const dbPath = resolveSpacesDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    _db = new Database(dbPath)
    _db.exec("PRAGMA journal_mode = WAL")
    _db.exec(
      `CREATE TABLE IF NOT EXISTS space_contexts (
        space_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    log.info("sqlite opened", { path: dbPath })

    // Load persisted spaces
    _persistedSpaces = loadSpacesSnapshot(_db)
    ensureAllSpaceFiles()
  }
  return _db
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizeSpaceId = (value: unknown): string => {
  if (typeof value !== "string") return DEFAULT_SPACE_ID
  const trimmed = value.trim()
  return trimmed || DEFAULT_SPACE_ID
}

const resolveSpaceId = (value: unknown) => normalizeSpaceId(value)

function resolveSpaceDir(spaceId: string) {
  return path.resolve(process.cwd(), ".opencode", "spaces", spaceId)
}

function createSpaceAgents(spaceId: string) {
  return [
    `# Space: ${spaceId}`,
    "",
    "## Scope",
    "",
    "- This file contains instructions specific to this graph space.",
    "- Put graph-domain rules here, not repository-wide development rules.",
    "- Space-specific skills can live under `skills/` in this directory.",
  ].join("\n")
}

function ensureSpaceFiles(spaceId: string) {
  const dir = resolveSpaceDir(spaceId)
  fs.mkdirSync(path.join(dir, "skills"), { recursive: true })
  const agents = path.join(dir, "AGENTS.md")
  if (!fs.existsSync(agents)) fs.writeFileSync(agents, createSpaceAgents(spaceId) + "\n")
}

function ensureAllSpaceFiles() {
  const ids = new Set([DEFAULT_SPACE_ID, ...Object.keys(_persistedSpaces)])
  for (const id of ids) ensureSpaceFiles(id)
}

// ---------------------------------------------------------------------------
// SQLite persistence
// ---------------------------------------------------------------------------

function loadSpacesSnapshot(db: Database): Record<string, PersistedSession> {
  try {
    const rows = db.query("SELECT space_id as spaceId, payload FROM space_contexts").all() as Array<{
      spaceId: string
      payload: string
    }>
    const result: Record<string, PersistedSession> = {}
    for (const row of rows) {
      try {
        result[row.spaceId] = JSON.parse(row.payload) as PersistedSession
      } catch {
        // skip malformed rows
      }
    }
    return result
  } catch {
    return {}
  }
}

function saveSpaceToDb(db: Database, spaceId: string, payload: PersistedSession) {
  const now = new Date().toISOString()
  db.query(
    "INSERT INTO space_contexts(space_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(space_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at",
  ).run(spaceId, JSON.stringify(payload), now)
}

function deleteSpaceFromDb(db: Database, spaceId: string) {
  db.query("DELETE FROM space_contexts WHERE space_id = ?").run(spaceId)
}

// ---------------------------------------------------------------------------
// Neo4j graph queries
// ---------------------------------------------------------------------------

async function loadGraphData(spaceId: string): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
  const session = getDriver().session()
  try {
    const nodeResult = await session.run(
      "MATCH (n) WHERE coalesce(n.space_id, $defaultSpaceId) = $space_id RETURN id(n) as id, labels(n) as labels, properties(n) as props",
      { space_id: spaceId, defaultSpaceId: DEFAULT_SPACE_ID },
    )
    const linkResult = await session.run(
      "MATCH (a)-[r]->(b) WHERE coalesce(a.space_id, $defaultSpaceId) = $space_id AND coalesce(b.space_id, $defaultSpaceId) = $space_id RETURN id(r) as id, id(a) as source, id(b) as target, type(r) as type",
      { space_id: spaceId, defaultSpaceId: DEFAULT_SPACE_ID },
    )

    const nodes: GraphNode[] = nodeResult.records.map((record) => {
      const props = record.get("props") as Record<string, unknown>
      const labels = (record.get("labels") as string[]) ?? []
      const name = typeof props.name === "string" ? props.name : String(record.get("id"))

      return {
        id: String(record.get("id")),
        name,
        label: labels[0] ?? "Entity",
        properties: props,
      }
    })

    const links: GraphLink[] = linkResult.records.map((record) => ({
      id: String(record.get("id")),
      source: String(record.get("source")),
      target: String(record.get("target")),
      type: String(record.get("type")),
    }))

    return { nodes, links }
  } finally {
    await session.close()
  }
}

async function listSpaces(currentSpaceId: string): Promise<SpaceInfo[]> {
  const db = getDb()
  const session = getDriver().session()
  try {
    const result = await session.run(
      "MATCH (n) RETURN coalesce(n.space_id, $defaultSpaceId) as spaceId, count(n) as nodeCount",
      { defaultSpaceId: DEFAULT_SPACE_ID },
    )

    const knownIds = new Set<string>(Object.keys(_persistedSpaces))
    const byId = new Map<string, SpaceInfo>()

    for (const record of result.records) {
      const id = String(record.get("spaceId") ?? DEFAULT_SPACE_ID)
      const rawCount = record.get("nodeCount") as { toNumber?: () => number } | number | undefined
      const nodeCount =
        typeof (rawCount as { toNumber?: () => number })?.toNumber === "function"
          ? (rawCount as { toNumber: () => number }).toNumber()
          : Number(rawCount ?? 0)
      byId.set(id, { id, nodeCount, current: id === currentSpaceId })
      knownIds.add(id)
    }

    for (const id of knownIds) {
      if (!byId.has(id)) byId.set(id, { id, nodeCount: 0, current: id === currentSpaceId })
    }

    if (!byId.has(DEFAULT_SPACE_ID)) {
      byId.set(DEFAULT_SPACE_ID, { id: DEFAULT_SPACE_ID, nodeCount: 0, current: currentSpaceId === DEFAULT_SPACE_ID })
    }

    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  } finally {
    await session.close()
  }
}

async function clearGraphForSpace(spaceId: string) {
  const session = getDriver().session()
  try {
    await session.run("MATCH (n) WHERE coalesce(n.space_id, $defaultSpaceId) = $space_id DETACH DELETE n", {
      space_id: spaceId,
      defaultSpaceId: DEFAULT_SPACE_ID,
    })
  } finally {
    await session.close()
  }
}

async function executeCypher(
  spaceId: string,
  query: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const session = getDriver().session()
  try {
    const scopedParams = {
      ...(params ?? {}),
      space_id: spaceId,
      spaceId: spaceId,
      defaultSpaceId: DEFAULT_SPACE_ID,
    }
    const result = await session.run(query, scopedParams)
    return result.records.map((record) => record.toObject())
  } finally {
    await session.close()
  }
}

// ---------------------------------------------------------------------------
// Zod schemas for OpenAPI
// ---------------------------------------------------------------------------

const ZGraphNode = z.object({
  id: z.string(),
  name: z.string().optional(),
  label: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
})

const ZGraphLink = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string().optional(),
})

const ZGraphPayload = z.object({
  nodes: ZGraphNode.array(),
  links: ZGraphLink.array(),
})

const ZSpace = z.object({
  id: z.string(),
  nodeCount: z.number(),
  current: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Hono Routes
// ---------------------------------------------------------------------------

export const OntologyRoutes = lazy(() =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Ontology health check",
        operationId: "ontology.health",
        responses: {
          200: {
            description: "OK",
            content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } },
          },
        },
      }),
      async (c) => {
        // Quick Neo4j ping
        try {
          const session = getDriver().session()
          try {
            await session.run("RETURN 1")
          } finally {
            await session.close()
          }
          return c.json({ ok: true })
        } catch (e) {
          return c.json({ ok: false, error: e instanceof Error ? e.message : "neo4j unreachable" }, 503)
        }
      },
    )

    // ---- Spaces ----
    .get(
      "/spaces",
      describeRoute({
        summary: "List ontology spaces",
        operationId: "ontology.spaces",
        responses: {
          200: {
            description: "Ontology spaces",
            content: {
              "application/json": {
                schema: resolver(z.object({ currentSpaceId: z.string(), spaces: ZSpace.array() })),
              },
            },
          },
        },
      }),
      validator("query", z.object({ spaceId: z.string().optional() })),
      async (c) => {
        const spaceId = resolveSpaceId(c.req.valid("query").spaceId)
        try {
          const spacesList = await listSpaces(spaceId)
          return c.json({ currentSpaceId: spaceId, spaces: spacesList })
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : "Failed to list spaces" }, 500)
        }
      },
    )

    .post(
      "/spaces",
      describeRoute({
        summary: "Create ontology space",
        operationId: "ontology.spaces.create",
        responses: {
          200: {
            description: "Space created",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.boolean(), currentSpaceId: z.string(), spaces: ZSpace.array() })),
              },
            },
          },
        },
      }),
      validator("json", z.object({ spaceId: z.string() })),
      async (c) => {
        const spaceId = resolveSpaceId(c.req.valid("json").spaceId)
        if (!spaceId) return c.json({ error: "spaceId is required" }, 400)

        const db = getDb()
        // Ensure persisted entry exists
        if (!_persistedSpaces[spaceId]) {
          const payload: PersistedSession = {
            spaceId,
            skills: [],
            heartbeat: "",
            basePrompt: "",
            memory: [],
            modelId: "",
            chatHistory: [],
            archives: [],
            threadId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            threadStartedAt: new Date().toISOString(),
          }
          saveSpaceToDb(db, spaceId, payload)
          _persistedSpaces[spaceId] = payload
        }
        ensureSpaceFiles(spaceId)

        const spacesList = await listSpaces(spaceId)
        return c.json({ ok: true, currentSpaceId: spaceId, spaces: spacesList })
      },
    )

    .delete(
      "/spaces/:name",
      describeRoute({
        summary: "Delete ontology space",
        operationId: "ontology.spaces.delete",
        responses: {
          200: {
            description: "Space deleted",
            content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const spaceId = resolveSpaceId(name)

        try {
          // Delete graph data
          await clearGraphForSpace(spaceId)

          // Delete from SQLite
          const db = getDb()
          deleteSpaceFromDb(db, spaceId)
          delete _persistedSpaces[spaceId]

          return c.json({ ok: true })
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : "Failed to delete space" }, 500)
        }
      },
    )

    // ---- Graph ----
    .get(
      "/graph",
      describeRoute({
        summary: "Get ontology graph",
        operationId: "ontology.graph",
        responses: {
          200: {
            description: "Graph data",
            content: { "application/json": { schema: resolver(ZGraphPayload) } },
          },
        },
      }),
      validator("query", z.object({ spaceId: z.string().optional() })),
      async (c) => {
        const spaceId = resolveSpaceId(c.req.valid("query").spaceId)
        try {
          const graph = await loadGraphData(spaceId)
          return c.json(graph)
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : "Failed to load graph" }, 500)
        }
      },
    )

    // ---- RPC (data-layer methods only) ----
    .post(
      "/rpc",
      describeRoute({
        summary: "Ontology RPC",
        operationId: "ontology.rpc",
        responses: {
          200: {
            description: "RPC result",
            content: { "application/json": { schema: resolver(z.object({ result: z.unknown() })) } },
          },
        },
      }),
      validator(
        "json",
        z.object({
          method: z.string(),
          params: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
      async (c) => {
        const { method, params = {} } = c.req.valid("json")

        const inferErrorCode = (rpcMethod: string, error: unknown) => {
          if (rpcMethod !== "graph.get") return "INTERNAL_ERROR"
          const message = error instanceof Error ? error.message : String(error)
          if (/unauthorized|incorrect authentication/i.test(message)) return "NEO4J_AUTH_FAILED"
          if (
            /failed to connect|econnreset|econnrefused|serviceunavailable|could not perform discovery/i.test(
              message.toLowerCase(),
            )
          )
            return "NEO4J_UNAVAILABLE"
          return "INTERNAL_ERROR"
        }

        try {
          if (method === "graph.get") {
            const spaceId = resolveSpaceId(params.spaceId)
            const graph = await loadGraphData(spaceId)
            return c.json({ result: graph })
          }

          if (method === "cypher.execute") {
            const spaceId = resolveSpaceId(params.spaceId)
            const query = typeof params.query === "string" ? params.query : ""
            if (!query) return c.json({ error: { code: "BAD_REQUEST", message: "query is required" } }, 400)
            const cypherParams = (params.params ?? {}) as Record<string, unknown>
            const rows = await executeCypher(spaceId, query, cypherParams)
            return c.json({ result: { rows, count: rows.length } })
          }

          if (method === "space.clear") {
            const spaceId = resolveSpaceId(params.spaceId)
            const targetRaw =
              typeof params.target === "string" ? (params.target as string).trim().toLowerCase() : "chat"
            type ClearTarget = "chat" | "memory" | "graph" | "all"
            const target: ClearTarget =
              targetRaw === "memory" || targetRaw === "graph" || targetRaw === "all" ? targetRaw : "chat"

            if (target === "graph" || target === "all") {
              await clearGraphForSpace(spaceId)
            }

            // Clear persisted data
            const db = getDb()
            const existing = _persistedSpaces[spaceId]
            if (existing) {
              const next: PersistedSession = {
                ...existing,
                memory: target === "memory" || target === "all" ? [] : existing.memory,
                chatHistory: target === "chat" || target === "all" ? [] : existing.chatHistory,
              }
              saveSpaceToDb(db, spaceId, next)
              _persistedSpaces[spaceId] = next
            }

            const graph = await loadGraphData(spaceId)
            return c.json({
              result: {
                ok: true,
                spaceId,
                target,
                graph,
                skills: existing?.skills ?? [],
                heartbeat: existing?.heartbeat ?? "",
                memory: target === "memory" || target === "all" ? [] : (existing?.memory ?? []),
              },
            })
          }

          if (method === "space.context") {
            const spaceId = resolveSpaceId(params.spaceId)
            const persisted = _persistedSpaces[spaceId]
            return c.json({
              result: {
                spaceId,
                current: persisted?.chatHistory ?? [],
                archives: persisted?.archives ?? [],
                skills: persisted?.skills ?? [],
                heartbeat: persisted?.heartbeat ?? "",
                memory: persisted?.memory ?? [],
                threadId: persisted?.threadId ?? "",
                modelId: persisted?.modelId ?? "",
              },
            })
          }

          return c.json({ error: { code: "METHOD_NOT_FOUND", message: `Unknown method: ${method}` } }, 404)
        } catch (e) {
          const code = inferErrorCode(method, e)
          return c.json({ error: { code, message: e instanceof Error ? e.message : "rpc failed" } }, 500)
        }
      },
    ),
)

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Initialize connections eagerly. Call during server startup. */
export async function init() {
  // Ensure DB is opened (lazy, but force it now)
  getDb()

  // Test Neo4j connection
  const session = getDriver().session()
  try {
    await session.run("RETURN 1")
    log.info("neo4j verified")
  } finally {
    await session.close()
  }
}

/** Graceful shutdown — close Neo4j driver and SQLite. */
export async function shutdown() {
  if (_driver) {
    await _driver.close()
    _driver = undefined
    log.info("neo4j closed")
  }
  if (_db) {
    _db.close()
    _db = undefined
    log.info("sqlite closed")
  }
}
