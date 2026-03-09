import { type Accessor, type JSX } from "solid-js"
import { sidebarExpanded } from "./sidebar-shell-helpers"

export const SidebarContent = (props: {
  mobile?: boolean
  opened: Accessor<boolean>
  settingsLabel: Accessor<string>
  settingsKeybind: Accessor<string | undefined>
  onOpenSettings: () => void
  renderPanel: () => JSX.Element
}): JSX.Element => {
  const expanded = () => props.mobile || sidebarExpanded(props.mobile, props.opened())

  return <div class="flex h-full w-full overflow-hidden">{expanded() ? props.renderPanel() : null}</div>
}
