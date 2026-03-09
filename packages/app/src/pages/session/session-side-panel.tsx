import { Match, Show, Switch, createEffect, createMemo, onCleanup, onMount, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { useParams } from "@solidjs/router"

import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useOntology } from "@/context/ontology"
import { type Sizing } from "@/pages/session/helpers"

export function SessionSidePanel(props: {
  reviewPanel: () => JSX.Element
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  reviewSnap: boolean
  size: Sizing
}) {
  const params = useParams()
  const layout = useLayout()
  const language = useLanguage()
  const ontology = useOntology()
  let ref: HTMLElement | undefined
  const [pane, setPane] = createStore({ total: 0 })

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const total = createMemo(
    () => pane.total || (typeof window === "undefined" ? layout.session.width() : window.innerWidth),
  )
  const reviewWidth = createMemo(() => Math.max(0, total() - layout.session.width()))
  const open = createMemo(
    () => isDesktop() && layout.view(`${params.dir}${params.id ? "/" + params.id : ""}`).reviewPanel.opened(),
  )
  const panelWidth = createMemo(() => (open() ? `${reviewWidth()}px` : "0px"))

  createEffect(() => {
    if (!params.id) return
    void ontology.refresh()
  })

  createEffect(() => {
    const el = ref?.parentElement
    if (!el) return

    const update = () => setPane("total", Math.floor(el.getBoundingClientRect().width))
    update()

    const observer = new ResizeObserver(update)
    observer.observe(el)
    onCleanup(() => observer.disconnect())
  })

  return (
    <Show when={isDesktop()}>
      <aside
        ref={ref}
        id="review-panel"
        aria-label={language.t("session.panel.reviewAndFiles")}
        aria-hidden={!open()}
        inert={!open()}
        class="relative min-w-0 h-full flex shrink-0 overflow-hidden bg-background-base"
        classList={{
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap,
        }}
        style={{ width: panelWidth() }}
      >
        <div class="relative size-full border-l border-border-weaker-base">
          <OntologyGraphPanel />
          <Show when={open()}>
            <div class="absolute inset-y-0 left-0" onPointerDown={() => props.size.start()}>
              <ResizeHandle
                direction="horizontal"
                edge="start"
                size={reviewWidth()}
                min={Math.max(320, total() - total() * 0.45)}
                max={Math.max(320, total() - 450)}
                onResize={(width) => {
                  props.size.touch()
                  layout.session.resize(Math.max(450, total() - width))
                }}
              />
            </div>
          </Show>
        </div>
      </aside>
    </Show>
  )
}

type GraphNode = {
  id: string
  name?: string
  label?: string
  x?: number
  y?: number
  val?: number
}

type GraphLink = {
  id: string
  source: string
  target: string
  type?: string
}

type GraphInstance = {
  width: (width: number) => GraphInstance
  height: (height: number) => GraphInstance
  backgroundColor: (color: string) => GraphInstance
  nodeLabel: (fn: (node: GraphNode) => string) => GraphInstance
  nodeCanvasObject: (fn: (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => void) => GraphInstance
  nodePointerAreaPaint: (fn: (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => void) => GraphInstance
  linkColor: (fn: (link: GraphLink) => string) => GraphInstance
  linkDirectionalArrowLength: (size: number) => GraphInstance
  linkDirectionalArrowRelPos: (pos: number) => GraphInstance
  linkLabel: (fn: (link: GraphLink) => string) => GraphInstance
  graphData: (data: { nodes: GraphNode[]; links: GraphLink[] }) => GraphInstance
  d3ReheatSimulation?: () => void
  _destructor?: () => void
}

export function OntologyGraphPanel() {
  const ontology = useOntology()
  const data = createMemo(() => ontology.graph())
  const [viewport, setViewport] = createStore({ width: 0, height: 0 })
  let ref: HTMLDivElement | undefined
  let graph: GraphInstance | undefined

  const colors: Record<string, string> = {}
  const palette = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]
  let idx = 0
  const color = (label: string) => {
    if (!colors[label]) {
      colors[label] = palette[idx % palette.length]
      idx += 1
    }
    return colors[label]
  }

  const destroy = () => {
    graph?._destructor?.()
    graph = undefined
  }

  const mount = async () => {
    if (!ref || viewport.width <= 0 || viewport.height <= 0) return
    destroy()

    try {
      const mod = await import("force-graph")
      const next: GraphInstance = new mod.default(ref)

      next
        .width(viewport.width)
        .height(viewport.height)
        .backgroundColor("transparent")
        .nodeLabel((node) => {
          const label = node.label ?? "Entity"
          const name = node.name ?? "?"
          return `<div style="font-size:11px;padding:4px 8px;background:rgba(0,0,0,0.85);color:#fff;border-radius:6px;max-width:240px"><div><b>${label}</b>: ${name}</div></div>`
        })
        .nodeCanvasObject((node, ctx, scale) => {
          const label = node.name ?? node.id
          const kind = node.label ?? "Entity"
          const font = Math.max(10 / scale, 2)
          const radius = Math.max(5, 3 + (node.val ?? 1))

          ctx.beginPath()
          ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
          ctx.fillStyle = color(kind)
          ctx.fill()
          ctx.strokeStyle = "rgba(255,255,255,0.3)"
          ctx.lineWidth = 1 / scale
          ctx.stroke()

          if (scale <= 0.6) return
          ctx.font = `${font}px sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "top"
          ctx.fillStyle = "rgba(200,200,200,0.9)"
          ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + radius + 2 / scale)
        })
        .nodePointerAreaPaint((node, fill, ctx) => {
          const radius = Math.max(5, 3 + (node.val ?? 1))
          ctx.beginPath()
          ctx.arc(node.x ?? 0, node.y ?? 0, radius + 2, 0, 2 * Math.PI)
          ctx.fillStyle = fill
          ctx.fill()
        })
        .linkColor(() => "rgba(100,100,100,0.4)")
        .linkDirectionalArrowLength(4)
        .linkDirectionalArrowRelPos(1)
        .linkLabel((link) => link.type ?? "")
        .graphData({
          nodes: data().nodes.map((node) => ({ ...node })),
          links: data().links.map((link) => ({ ...link })),
        })

      graph = next
    } catch (err) {
      console.error("force-graph init failed", err)
    }
  }

  onMount(() => {
    if (!ref) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setViewport({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    })
    observer.observe(ref)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return
    void mount()
  })

  createEffect(() => {
    if (!graph) return
    graph.graphData({
      nodes: data().nodes.map((node) => ({ ...node })),
      links: data().links.map((link) => ({ ...link })),
    })
    graph.d3ReheatSimulation?.()
  })

  onCleanup(destroy)

  return (
    <Switch>
      <Match when={ontology.error()}>
        <div class="flex h-full items-center justify-center px-4 py-3 text-12-regular text-danger-base">
          {ontology.error()}
        </div>
      </Match>
      <Match when={ontology.loading()}>
        <div class="flex h-full items-center justify-center px-4 py-3 text-12-regular text-text-weak">
          Loading graph...
        </div>
      </Match>
      <Match when={data().nodes.length === 0}>
        <div class="flex h-full items-center justify-center px-4 py-3 text-center text-12-regular text-text-weak">
          <div>
            <div class="mb-1">No nodes in this space</div>
            <div class="text-11">Use the chat to create ontology nodes</div>
          </div>
        </div>
      </Match>
      <Match when={true}>
        <div ref={ref} class="h-full w-full" />
      </Match>
    </Switch>
  )
}
