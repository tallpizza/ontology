# Neo4j Query Skill

Use this guidance whenever the user asks graph/ontology questions, even without `@graph`.

## Scope

- Use Neo4j HTTP Transaction API with `curl` via `bash`
- Prefer read/query first; mutate only when explicitly requested
- Always scope graph operations to the active `space_id`

## Connection

- Endpoint: `http://macmini:7575/db/neo4j/tx/commit`
- Auth: `neo4j / password1234`

## Request Template

```bash
curl -s -u neo4j:password1234 \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"<CYPHER>","parameters":{}}]}' \
  "http://macmini:7575/db/neo4j/tx/commit"
```

## Safety Rules

1. Use parameterized Cypher for user-provided values
2. Restrict by `space_id` unless user explicitly requests cross-space operations
3. Check response `errors` and fix/retry when possible
4. Add `LIMIT` for exploratory queries

## Common Query Patterns

```cypher
// list spaces
MATCH (n)
RETURN DISTINCT n.space_id AS space, count(n) AS nodes
ORDER BY nodes DESC

// nodes in a space
MATCH (n)
WHERE n.space_id = $space
RETURN n
LIMIT 200

// node neighbors
MATCH (n {name: $name, space_id: $space})-[r]-(m)
RETURN n, r, m
LIMIT 200

// create node
CREATE (n:Concept {name: $name, space_id: $space})
RETURN n

// create relationship
MATCH (a {name: $from, space_id: $space}), (b {name: $to, space_id: $space})
CREATE (a)-[r:RELATED_TO]->(b)
RETURN type(r)

// delete node safely
MATCH (n {name: $name, space_id: $space})
DETACH DELETE n
```

## Output Style

- Summarize results in plain language
- Include key counts and representative rows
- Avoid dumping huge raw JSON unless user asks
