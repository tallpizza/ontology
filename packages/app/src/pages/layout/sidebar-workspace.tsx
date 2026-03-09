import { useNavigate } from "@solidjs/router"
import { createMemo, createSignal, For, Show, type Accessor, type JSX } from "solid-js"
import { base64Encode } from "@opencode-ai/util/encode"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { type Session } from "@opencode-ai/sdk/v2/client"
import { type LocalProject } from "@/context/layout"
import { useOntology } from "@/context/ontology"

type InlineEditorComponent = (props: {
  id: string
  value: Accessor<string>
  onSave: (next: string) => void
  class?: string
  displayClass?: string
  editing?: boolean
  stopPropagation?: boolean
  openOnDblClick?: boolean
}) => JSX.Element

export type WorkspaceSidebarContext = {
  currentDir: Accessor<string>
  sidebarExpanded: Accessor<boolean>
  sidebarHovering: Accessor<boolean>
  nav: Accessor<HTMLElement | undefined>
  hoverSession: Accessor<string | undefined>
  setHoverSession: (id: string | undefined) => void
  clearHoverProjectSoon: () => void
  prefetchSession: (session: Session, priority?: "high" | "low") => void
  archiveSession: (session: Session) => Promise<void>
  workspaceName: (directory: string, projectId?: string, branch?: string) => string | undefined
  renameWorkspace: (directory: string, next: string, projectId?: string, branch?: string) => void
  editorOpen: (id: string) => boolean
  openEditor: (id: string, value: string) => void
  closeEditor: () => void
  setEditor: (key: "value", value: string) => void
  InlineEditor: InlineEditorComponent
  isBusy: (directory: string) => boolean
  workspaceExpanded: (directory: string, local: boolean) => boolean
  setWorkspaceExpanded: (directory: string, value: boolean) => void
  showResetWorkspaceDialog: (root: string, directory: string) => void
  showDeleteWorkspaceDialog: (root: string, directory: string) => void
  setScrollContainerRef: (el: HTMLDivElement | undefined, mobile?: boolean) => void
}

const SidebarSpaceList = (props: { slug: Accessor<string> }) => {
  const ontology = useOntology()
  const navigate = useNavigate()
  const [confirm, setConfirm] = createSignal<string>()
  const [deleting, setDeleting] = createSignal(false)
  const spaces = createMemo(() =>
    ontology.spaces().length ? ontology.spaces() : [{ id: ontology.spaceID(), nodeCount: 0 }],
  )

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await ontology.deleteSpace(id)
    } finally {
      setDeleting(false)
      setConfirm(undefined)
    }
  }

  return (
    <div class="flex flex-col gap-1">
      <For each={spaces()}>
        {(space) => (
          <Show
            when={confirm() === space.id}
            fallback={
              <div
                class="group/space w-full px-3 py-2 rounded-md text-left text-13-regular flex items-center justify-between transition-colors hover:bg-surface-raised-base-hover cursor-default"
                classList={{
                  "bg-surface-base-active text-text-strong": ontology.spaceID() === space.id,
                  "text-text-weak": ontology.spaceID() !== space.id,
                }}
                onClick={() => {
                  void ontology
                    .selectSpace(space.id)
                    .then(() => navigate(`/${props.slug()}/session?space=${encodeURIComponent(space.id)}`))
                }}
              >
                <span class="truncate">{space.id}</span>
                <div class="flex items-center gap-1">
                  <span class="text-11">{space.nodeCount}</span>
                  <Show when={space.id !== "default"}>
                    <IconButton
                      icon="trash"
                      variant="ghost"
                      class="size-5 rounded text-icon-weak hover:text-icon-critical-base opacity-0 pointer-events-none group-hover/space:opacity-100 group-hover/space:pointer-events-auto"
                      classList={{
                        "opacity-100 pointer-events-auto": ontology.spaceID() === space.id,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirm(space.id)
                      }}
                      aria-label="Delete space"
                    />
                  </Show>
                </div>
              </div>
            }
          >
            <div class="px-3 py-2 rounded-md bg-surface-raised-base border border-border-weak-base flex flex-col gap-2">
              <div class="flex items-center gap-1.5 text-13-medium text-text-strong">
                <Icon name="warning" class="size-4 text-icon-critical-base shrink-0" />
                <span class="truncate">Delete "{space.id}"?</span>
              </div>
              <p class="text-12-regular text-text-weak">
                관련 노드 {space.nodeCount}개가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              <div class="flex justify-end gap-1.5">
                <Button variant="ghost" size="small" onClick={() => setConfirm(undefined)} disabled={deleting()}>
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  disabled={deleting()}
                  onClick={() => void handleDelete(space.id)}
                  class="bg-surface-critical-base hover:bg-surface-critical-base-hover"
                >
                  {deleting() ? "삭제 중..." : "삭제"}
                </Button>
              </div>
            </div>
          </Show>
        )}
      </For>
    </div>
  )
}

export const LocalWorkspace = (props: {
  ctx: WorkspaceSidebarContext
  project: LocalProject
  sortNow: Accessor<number>
  mobile?: boolean
}): JSX.Element => {
  const slug = createMemo(() => base64Encode(props.project.worktree))

  return (
    <div
      ref={(el) => props.ctx.setScrollContainerRef(el, props.mobile)}
      class="size-full flex flex-col py-2 overflow-y-auto no-scrollbar [overflow-anchor:none]"
    >
      <nav class="flex flex-col gap-1 px-2">
        <SidebarSpaceList slug={slug} />
      </nav>
    </div>
  )
}
