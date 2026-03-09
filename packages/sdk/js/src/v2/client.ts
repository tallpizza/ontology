export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
export { type Config as OpencodeClientConfig, OpencodeClient }

export function createOpencodeClient(config?: Config & { directory?: string; space?: string }) {
  const base =
    config?.fetch ??
    ((req: Request) => {
      // @ts-ignore
      req.timeout = false
      return fetch(req)
    })

  const withScope = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const directory = config?.directory
    if (directory) {
      const encoded = /[^\x00-\x7F]/.test(directory) ? encodeURIComponent(directory) : directory
      req.headers.set("x-opencode-directory", encoded)
    }

    const space =
      config?.space ??
      (typeof localStorage === "undefined" ? undefined : (localStorage.getItem("opencode.ontology.space") ?? "default"))
    if (space) req.headers.set("x-opencode-space", space)

    return base(req)
  }

  const client = createClient({
    ...config,
    fetch: withScope,
  })
  return new OpencodeClient({ client })
}
