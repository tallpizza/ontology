import path from "path"
import { Context } from "@/util/context"
import { Instance } from "@/project/instance"

interface State {
  spaceID?: string
}

const context = Context.create<State>("ontology-space")

export const OntologySpaceContext = {
  async provide<R>(input: { spaceID?: string; fn: () => R }): Promise<R> {
    return context.provide({ spaceID: input.spaceID }, async () => input.fn())
  },

  get spaceID() {
    try {
      return context.use().spaceID
    } catch {
      return undefined
    }
  },

  /** Computed space directory: `{project}/.opencode/spaces/{spaceID}/` */
  get directory(): string | undefined {
    const id = this.spaceID ?? "default"
    try {
      return path.join(Instance.directory, ".opencode", "spaces", id)
    } catch {
      return undefined
    }
  },
}
