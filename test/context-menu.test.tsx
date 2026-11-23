import { checkPattern } from "@ui-sdk/core/testing"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../registry/base-nova/ui/context-menu"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

function Surface({
  onSelect,
  ...root
}: React.ComponentProps<typeof ContextMenu> & { onSelect?: () => void }) {
  return (
    <div>
      <ContextMenu {...root}>
        <ContextMenuTrigger tabIndex={0}>Canvas area</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuLabel>Edit</ContextMenuLabel>
            <ContextMenuItem onClick={onSelect}>
              Copy
              <ContextMenuShortcut>⌘C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem disabled>Cut</ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <button type="button">Outside</button>
    </div>
  )
}

const area = () => screen.getByText("Canvas area")
const openMenu = async () => {
  fireEvent.contextMenu(area())
  return screen.findByRole("menu")
}
const key = (name: string, target: Element = document.activeElement as Element) =>
  fireEvent.keyDown(target, { key: name })

describe("ContextMenu: behaviour (frontend#247, on @ui-sdk)", () => {
  it("stays closed until the context-menu gesture", () => {
    render(<Surface />)

    expect(screen.queryByRole("menu")).toBeNull()
    expect(area().hasAttribute("data-closed")).toBe(true)
  })

  it("opens on the context-menu gesture and marks the area open", async () => {
    render(<Surface />)

    await openMenu()

    expect(area().hasAttribute("data-open")).toBe(true)
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Copy⌘C", "Cut", "Delete"])
  })

  it("leaves the browser's own menu alone for a disabled area", () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger disabled>Canvas area</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Copy</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    )

    const proceeded = fireEvent.contextMenu(area())

    expect(proceeded).toBe(true)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("opens from the keyboard on a focusable area and moves focus into the menu", async () => {
    render(<Surface />)
    area().focus()

    // Shift+F10 and the context-menu key make the browser send a contextmenu event that is not button 2.
    fireEvent.contextMenu(area(), { button: 0 })

    expect(await screen.findByRole("menu")).toBeTruthy()
    await waitFor(() => expect(screen.getByRole("menu").contains(document.activeElement)).toBe(true))
  })

  it("moves focus through items with the arrow keys, and a disabled item stays focusable", async () => {
    render(<Surface />)
    await openMenu()
    screen.getByRole("menuitem", { name: /Copy/ }).focus()

    key("ArrowDown")
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Cut" }))
    key("ArrowDown")
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }))
  })

  it("runs an item's onClick on Enter and closes the menu", async () => {
    const onSelect = vi.fn()
    render(<Surface onSelect={onSelect} />)
    await openMenu()
    screen.getByRole("menuitem", { name: /Copy/ }).focus()

    key("Enter")

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("runs an item's onClick once when it is pressed with the pointer", async () => {
    const onSelect = vi.fn()
    render(<Surface onSelect={onSelect} />)
    await openMenu()

    fireEvent.click(screen.getByRole("menuitem", { name: /Copy/ }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("does nothing when a disabled item is chosen", async () => {
    render(<Surface />)
    await openMenu()
    const cut = screen.getByRole("menuitem", { name: "Cut" })

    fireEvent.click(cut)

    expect(cut.getAttribute("aria-disabled")).toBe("true")
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  it("closes on Escape", async () => {
    render(<Surface />)
    await openMenu()
    screen.getByRole("menuitem", { name: /Copy/ }).focus()

    key("Escape")

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("reports why it opened and closed through onOpenChange(open, details)", async () => {
    const onOpenChange = vi.fn()
    render(<Surface onOpenChange={onOpenChange} />)

    await openMenu()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: expect.any(String) }))

    screen.getByRole("menuitem", { name: /Copy/ }).focus()
    key("Escape")
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" }))
  })

  it("closes on a press outside it", async () => {
    render(<Surface />)
    await openMenu()

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }))
    fireEvent.pointerUp(screen.getByRole("button", { name: "Outside" }))
    fireEvent.click(screen.getByRole("button", { name: "Outside" }))

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("repositions an open menu on a second right-click in the same area", async () => {
    render(<Surface />)
    await openMenu()

    fireEvent.contextMenu(area(), { clientX: 40, clientY: 50 })

    expect(screen.getAllByRole("menu")).toHaveLength(1)
  })
})

describe("ContextMenu: checkbox, radio and sub parts", () => {
  function Parts({ onChecked, onValue }: { onChecked?: (checked: boolean) => void; onValue?: (value: string) => void }) {
    const [checked, setChecked] = React.useState(false)
    return (
      <ContextMenu>
        <ContextMenuTrigger>Canvas area</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuCheckboxItem
            checked={checked}
            onCheckedChange={(next) => {
              setChecked(next)
              onChecked?.(next)
            }}
          >
            Grid
          </ContextMenuCheckboxItem>
          <ContextMenuRadioGroup defaultValue="fit" onValueChange={(value) => onValue?.(value as string)}>
            <ContextMenuRadioItem value="fit">Fit</ContextMenuRadioItem>
            <ContextMenuRadioItem value="fill">Fill</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>More</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Export</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  it("toggles a checkbox item without a value, draws its check, and keeps the menu open", async () => {
    const onChecked = vi.fn()
    render(<Parts onChecked={onChecked} />)
    await openMenu()
    const item = screen.getByRole("menuitemcheckbox", { name: "Grid" })
    expect(item.querySelector("svg")).toBeNull()

    fireEvent.click(item)

    expect(onChecked).toHaveBeenCalledWith(true)
    expect(screen.getByRole("menuitemcheckbox", { name: "Grid" }).querySelector("svg")).not.toBeNull()
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  it("chooses one radio item in its group and reports the value", async () => {
    const onValue = vi.fn()
    render(<Parts onValue={onValue} />)
    await openMenu()
    expect(screen.getByRole("menuitemradio", { name: "Fit" }).getAttribute("aria-checked")).toBe("true")

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Fill" }))

    expect(onValue).toHaveBeenCalledWith("fill")
    expect(screen.getByRole("menuitemradio", { name: "Fill" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("menuitemradio", { name: "Fit" }).getAttribute("aria-checked")).toBe("false")
  })

  it("opens a submenu with ArrowRight and closes only the submenu on Escape", async () => {
    render(<Parts />)
    await openMenu()
    screen.getByRole("menuitem", { name: "More" }).focus()

    key("ArrowRight")
    await screen.findByRole("menuitem", { name: "Export" })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Export" })))
    key("Escape")

    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Export" })).toBeNull())
    expect(screen.queryByRole("menu")).not.toBeNull()
  })
})

describe("ContextMenu: slots and variants", () => {
  it("keeps the data-slot values the classes and the theme target", async () => {
    render(<Surface />)
    await openMenu()

    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)
    expect(slot("context-menu-trigger")).toBe(area())
    expect(slot("context-menu-content")).toBe(screen.getByRole("menu"))
    expect(slot("context-menu-group")).not.toBeNull()
    expect(slot("context-menu-label")?.textContent).toBe("Edit")
    expect(slot("context-menu-item")).not.toBeNull()
    expect(slot("context-menu-separator")).not.toBeNull()
    expect(slot("context-menu-shortcut")?.textContent).toBe("⌘C")
  })

  it("takes a render element and a data-slot for its trigger, as the issue row does", () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger render={<li />} data-slot="issue-row" className="row">
          Row
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Open</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    )

    const row = screen.getByText("Row")
    expect(row.tagName).toBe("LI")
    expect(row.getAttribute("data-slot")).toBe("issue-row")
    expect(row.className).toContain("row")
  })

  it("sets data-variant and data-inset on an item and merges className", async () => {
    render(
      <ContextMenu defaultOpen>
        <ContextMenuTrigger>Canvas area</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem inset className="mine">
            Copy
          </ContextMenuItem>
          <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    )
    await screen.findByRole("menu")

    const copy = screen.getByRole("menuitem", { name: "Copy" })
    expect(copy.getAttribute("data-variant")).toBe("default")
    expect(copy.hasAttribute("data-inset")).toBe(true)
    expect(copy.className).toContain("mine")
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe("destructive")
    expect(screen.getByRole("menu").className).toContain("w-56")
  })
})

describe("ContextMenu: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/context-menu.tsx"), "utf8")

  it("styles the highlighted item, open and closed with the attributes the SDK sets", () => {
    expect(source).toContain("data-highlighted:")
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/menu")
  })
})

describe("ContextMenu: accessibility", () => {
  it("passes the SDK's menu pattern check", async () => {
    render(<Surface />)
    const menu = await openMenu()

    await checkPattern(menu, "menu")
  })

  it("has no axe violations while open", async () => {
    render(<Surface />)
    await openMenu()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
