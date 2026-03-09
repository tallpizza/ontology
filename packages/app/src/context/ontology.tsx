import { createSimpleContext } from "@opencode-ai/ui/context"
import { createMemo, createSignal } from "solid-js"
import { useServer } from "./server"

export type OntologySpace = {
  id: string
  nodeCount: number
  current?: boolean
}

export type OntologyGraph = {
  nodes: Array<{ id: string; name?: string; label?: string }>
  links: Array<{ id: string; source: string; target: string; type?: string }>
}

const STORAGE_KEY = "opencode.ontology.space"

const readURLSpace = () => {
  if (typeof window === "undefined") return undefined
  return new URL(window.location.href).searchParams.get("space") ?? undefined
}

const syncURLSpace = (space: string) => {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (url.searchParams.get("space") === space) return
  url.searchParams.set("space", space)
  const query = url.searchParams.toString()
  const href = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`
  window.history.replaceState(window.history.state, "", href)
}

export const { use: useOntology, provider: OntologyProvider } = createSimpleContext({
  name: "Ontology",
  init: () => {
    const [spaces, setSpaces] = createSignal<OntologySpace[]>([])
    const [spaceID, setSpaceID] = createSignal<string>(
      readURLSpace() ??
        (typeof localStorage === "undefined" ? "default" : localStorage.getItem(STORAGE_KEY) || "default"),
    )
    const [graph, setGraph] = createSignal<OntologyGraph>({ nodes: [], links: [] })
    const [loading, setLoading] = createSignal(false)
    const [error, setError] = createSignal<string>()

    const server = useServer()
    const apiBase = createMemo(() => {
      const serverUrl = server.current?.http?.url ?? ""
      return `${serverUrl.replace(/\/$/, "")}/ontology`
    })

    const saveSpace = (next: string) => {
      setSpaceID(next)
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next)
      syncURLSpace(next)
    }

    const fetchSpaces = async () => {
      const res = await fetch(`${apiBase()}/spaces?spaceId=${encodeURIComponent(spaceID())}`)
      if (!res.ok) throw new Error(`spaces ${res.status}`)
      const payload = (await res.json()) as { currentSpaceId?: string; spaces?: OntologySpace[] }
      if (payload.currentSpaceId) saveSpace(payload.currentSpaceId)
      setSpaces(payload.spaces ?? [])
    }

    const fetchGraph = async (nextSpaceID = spaceID()) => {
      const res = await fetch(`${apiBase()}/graph?spaceId=${encodeURIComponent(nextSpaceID)}`)
      if (!res.ok) throw new Error(`graph ${res.status}`)
      const payload = (await res.json()) as OntologyGraph
      setGraph({ nodes: payload.nodes ?? [], links: payload.links ?? [] })
    }

    const refresh = async () => {
      setLoading(true)
      setError(undefined)
      try {
        await fetchSpaces()
        await fetchGraph()
      } catch (e) {
        setError(e instanceof Error ? e.message : "ontology fetch failed")
      } finally {
        setLoading(false)
      }
    }

    const selectSpace = async (nextSpaceID: string) => {
      saveSpace(nextSpaceID)
      setLoading(true)
      setError(undefined)
      try {
        await Promise.all([fetchSpaces(), fetchGraph(nextSpaceID)])
      } catch (e) {
        setError(e instanceof Error ? e.message : "ontology select failed")
      } finally {
        setLoading(false)
      }
    }

    const deleteSpace = async (target: string) => {
      const res = await fetch(`${apiBase()}/spaces/${encodeURIComponent(target)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`delete space ${res.status}`)
      const fallback = target === spaceID() ? "default" : spaceID()
      saveSpace(fallback)
      setLoading(true)
      setError(undefined)
      try {
        await Promise.all([fetchSpaces(), fetchGraph(fallback)])
      } catch (e) {
        setError(e instanceof Error ? e.message : "ontology delete failed")
      } finally {
        setLoading(false)
      }
    }

    // Auto-fetch on mount
    void refresh()

    return {
      spaces,
      spaceID,
      graph,
      loading,
      error,
      refresh,
      selectSpace,
      deleteSpace,
    }
  },
})
