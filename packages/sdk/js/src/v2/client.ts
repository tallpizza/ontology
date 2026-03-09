export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
export { type Config as OpencodeClientConfig, OpencodeClient }

type ScopedFetch = typeof fetch & {
  preconnect?: (url: string | URL) => void
}

export function createOpencodeClient(config?: Config & { directory?: string; space?: string }) {
  const globalFetch = fetch as ScopedFetch
  const base =
    config?.fetch ??
    ((req: Request) => {
      Reflect.set(req, "timeout", false)
      return globalFetch(req)
    })

  const withScope = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init)
      const directory = config?.directory
      if (directory) {
        const encoded = /[^\x00-\x7F]/.test(directory) ? encodeURIComponent(directory) : directory
        req.headers.set("x-opencode-directory", encoded)
      }

      const space =
        config?.space ??
        (typeof localStorage === "undefined"
          ? undefined
          : (localStorage.getItem("opencode.ontology.space") ?? "default"))
      if (space) req.headers.set("x-opencode-space", space)

      return base(req)
    },
    {
      preconnect: (url: string | URL) => {
        globalFetch.preconnect?.(url)
      },
    },
  )

  const client = createClient({
    ...config,
    fetch: withScope,
  })
  return new OpencodeClient({ client })
}
