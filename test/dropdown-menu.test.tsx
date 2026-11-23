import * as React from "react"
import { checkPattern } from "@ui-sdk/core/testing"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../registry/base-nova/ui/dropdown-menu"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

type MenuProps = React.ComponentProps<typeof DropdownMenu>

function Actions({
  onRename,
  onDelete,
  ...root
}: MenuProps & { onRename?: () => void; onDelete?: () => void }) {
  return (
    <div>
      <DropdownMenu {...root}>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Project</DropdownMenuLabel>
            <DropdownMenuItem onClick={onRename}>
              Rename
              <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Archive</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button">Outside</button>
    </div>
  )
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Actions" }))
  return screen.findByRole("menu")
}

const key = (name: string, target: Element = document.activeElement as Element) =>
  fireEvent.keyDown(target, { key: name })

describe("DropdownMenu: behaviour (frontend#247, on @ui-sdk)", () => {
  it("stays closed until its trigger is pressed, and the trigger says it has a menu", () => {
    render(<Actions />)

    const trigger = screen.getByRole("button", { name: "Actions" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(trigger.hasAttribute("data-closed")).toBe(true)
  })

  it("opens a menu of items, labelled by its trigger, and marks the trigger open", async () => {
    render(<Actions />)

    const menu = await open()

    expect(screen.getByRole("button", { name: "Actions" }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "Actions" }).hasAttribute("data-open")).toBe(true)
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rename⌘R", "Archive", "Delete"])
    expect(menu.getAttribute("aria-labelledby")).toBe(screen.getByRole("button", { name: "Actions" }).id)
  })

  it("opens from the keyboard on the first item with ArrowDown and on the last with ArrowUp", async () => {
    render(<Actions />)
    const trigger = screen.getByRole("button", { name: "Actions" })
    trigger.focus()

    key("ArrowDown", trigger)
    await screen.findByRole("menu")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Rename/ })))

    cleanup()
    render(<Actions />)
    const again = screen.getByRole("button", { name: "Actions" })
    again.focus()
    key("ArrowUp", again)
    await screen.findByRole("menu")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" })))
  })

  it("moves focus through the items with the arrow keys, Home and End, and a disabled item stays focusable", async () => {
    render(<Actions />)
    await open()
    const rename = screen.getByRole("menuitem", { name: /Rename/ })
    rename.focus()

    key("ArrowDown")
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Archive" }))
    key("ArrowDown")
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }))
    key("Home")
    expect(document.activeElement).toBe(rename)
    key("End")
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }))
  })

  it("runs an item's onClick on Enter, closes the menu and returns focus to the trigger", async () => {
    const onRename = vi.fn()
    render(<Actions onRename={onRename} />)
    await open()
    screen.getByRole("menuitem", { name: /Rename/ }).focus()

    key("Enter")

    expect(onRename).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions" }))
  })

  it("runs an item's onClick when it is pressed with the pointer", async () => {
    const onDelete = vi.fn()
    render(<Actions onDelete={onDelete} />)
    await open()

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("does nothing when a disabled item is chosen, and marks it disabled", async () => {
    const onOpenChange = vi.fn()
    render(<Actions onOpenChange={onOpenChange} />)
    await open()
    const archive = screen.getByRole("menuitem", { name: "Archive" })

    fireEvent.click(archive)

    expect(archive.getAttribute("aria-disabled")).toBe("true")
    expect(archive.hasAttribute("data-disabled")).toBe(true)
    expect(screen.queryByRole("menu")).not.toBeNull()
    expect(onOpenChange).toHaveBeenCalledTimes(1)
  })

  it("closes on Escape and puts focus back on the trigger", async () => {
    render(<Actions />)
    await open()
    screen.getByRole("menuitem", { name: /Rename/ }).focus()

    key("Escape")

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions" }))
  })

  it("reports why it opened and closed through onOpenChange(open, details)", async () => {
    const onOpenChange = vi.fn()
    render(<Actions onOpenChange={onOpenChange} />)

    await open()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    screen.getByRole("menuitem", { name: /Rename/ }).focus()
    key("Escape")
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" }))
  })

  it("closes on a press outside it", async () => {
    render(<Actions />)
    await open()

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }))
    fireEvent.pointerUp(screen.getByRole("button", { name: "Outside" }))
    fireEvent.click(screen.getByRole("button", { name: "Outside" }))

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("can be controlled with open and onOpenChange", async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Actions open={false} onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Actions" }))
    expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything())
    expect(screen.queryByRole("menu")).toBeNull()

    rerender(<Actions open onOpenChange={onOpenChange} />)
    expect(await screen.findByRole("menu")).toBeTruthy()
  })
})

describe("DropdownMenu: checkbox and radio items", () => {
  function View({
    onChecked,
    onValue,
  }: {
    onChecked?: (checked: boolean, details: { reason: string }) => void
    onValue?: (value: string, details: { reason: string }) => void
  }) {
    const [checked, setChecked] = React.useState(false)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>View</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem
            value="status-bar"
            checked={checked}
            onCheckedChange={(next, details) => {
              setChecked(next)
              onChecked?.(next, details as never)
            }}
          >
            Status bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup defaultValue="comfortable" onValueChange={onValue as never}>
            <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const openView = async () => {
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    return screen.findByRole("menu")
  }

  it("toggles a checkbox item, reports it with a reason, and keeps the menu open", async () => {
    const onChecked = vi.fn()
    render(<View onChecked={onChecked} />)
    await openView()
    const item = screen.getByRole("menuitemcheckbox", { name: "Status bar" })
    expect(item.getAttribute("aria-checked")).toBe("false")

    fireEvent.click(item)

    expect(onChecked).toHaveBeenCalledWith(true, expect.objectContaining({ reason: "item-press" }))
    expect(screen.getByRole("menuitemcheckbox", { name: "Status bar" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("menuitemcheckbox", { name: "Status bar" }).hasAttribute("data-checked")).toBe(true)
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  it("draws a check only while a checkbox item is checked", async () => {
    render(<View />)
    await openView()
    const item = screen.getByRole("menuitemcheckbox", { name: "Status bar" })
    expect(item.querySelector("svg")).toBeNull()

    fireEvent.click(item)

    expect(screen.getByRole("menuitemcheckbox", { name: "Status bar" }).querySelector("svg")).not.toBeNull()
  })

  it("chooses one radio item in its group, reports the value, and keeps the menu open", async () => {
    const onValue = vi.fn()
    render(<View onValue={onValue} />)
    await openView()
    expect(screen.getByRole("menuitemradio", { name: "Comfortable" }).getAttribute("aria-checked")).toBe("true")

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Compact" }))

    expect(onValue).toHaveBeenCalledWith("compact", expect.objectContaining({ reason: "item-press" }))
    expect(screen.getByRole("menuitemradio", { name: "Compact" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("menuitemradio", { name: "Comfortable" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.queryByRole("menu")).not.toBeNull()
  })
})

describe("DropdownMenu: submenus", () => {
  function Nested() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Edit</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Undo</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Find</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Find next</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const openNested = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    await screen.findByRole("menu")
    const subTrigger = screen.getByRole("menuitem", { name: "Find" })
    subTrigger.focus()
    return subTrigger
  }

  it("opens a submenu with ArrowRight, moves focus into it and marks the sub trigger open", async () => {
    render(<Nested />)
    const subTrigger = await openNested()
    expect(subTrigger.getAttribute("aria-haspopup")).toBe("menu")

    key("ArrowRight")

    expect(await screen.findByRole("menuitem", { name: "Find next" })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Find next" })))
    expect(screen.getByRole("menuitem", { name: "Find" }).hasAttribute("data-open")).toBe(true)
  })

  it("closes only the submenu on Escape and returns focus to its trigger", async () => {
    render(<Nested />)
    await openNested()
    key("ArrowRight")
    await screen.findByRole("menuitem", { name: "Find next" })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Find next" })))

    key("Escape")

    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Find next" })).toBeNull())
    expect(screen.queryByRole("menu")).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Find" }))
  })

  it("closes a submenu that a hover opened before it closes the menu on Escape (ui#1006)", async () => {
    render(<Nested />)
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    await screen.findByRole("menu")
    const subTrigger = screen.getByRole("menuitem", { name: "Find" })

    fireEvent.pointerEnter(subTrigger, { pointerType: "mouse" })
    fireEvent.pointerMove(subTrigger, { pointerType: "mouse" })
    await screen.findByRole("menuitem", { name: "Find next" })

    fireEvent.keyDown(document.activeElement ?? subTrigger, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Find next" })).toBeNull())
    expect(screen.queryByRole("menu")).not.toBeNull()
  })
})

describe("DropdownMenu: slots, variants and placement", () => {
  it("keeps the data-slot values the theme and the sidebar already target", async () => {
    render(<Actions />)
    await open()

    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)
    expect(slot("dropdown-menu-trigger")).toBe(screen.getByRole("button", { name: "Actions" }))
    expect(slot("dropdown-menu-content")).toBe(screen.getByRole("menu"))
    expect(slot("dropdown-menu-group")).not.toBeNull()
    expect(slot("dropdown-menu-label")?.textContent).toBe("Project")
    expect(slot("dropdown-menu-item")).not.toBeNull()
    expect(slot("dropdown-menu-separator")).not.toBeNull()
    expect(slot("dropdown-menu-shortcut")?.textContent).toBe("⌘R")
  })

  it("keeps the data-slot values of the checkbox, radio and sub parts", async () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>View</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem value="a" checked>
            A
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="b">
            <DropdownMenuRadioItem value="b">B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>C</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await screen.findByRole("menu")

    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)
    expect(slot("dropdown-menu-checkbox-item")).not.toBeNull()
    expect(slot("dropdown-menu-checkbox-item-indicator")).not.toBeNull()
    expect(slot("dropdown-menu-radio-group")).not.toBeNull()
    expect(slot("dropdown-menu-radio-item")).not.toBeNull()
    expect(slot("dropdown-menu-radio-item-indicator")).not.toBeNull()
    expect(slot("dropdown-menu-sub-trigger")).not.toBeNull()
  })

  it("sets data-variant, data-inset and merges className on an item", async () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem inset className="mine">
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await screen.findByRole("menu")

    const rename = screen.getByRole("menuitem", { name: "Rename" })
    expect(rename.getAttribute("data-variant")).toBe("default")
    expect(rename.hasAttribute("data-inset")).toBe(true)
    expect(rename.className).toContain("mine")
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe("destructive")
    expect(screen.getByRole("menu").className).toContain("w-56")
  })

  it("opens below the trigger and aligned to its start by default, and takes side and align", async () => {
    const { unmount } = render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const menu = await screen.findByRole("menu")
    expect(menu.getAttribute("data-side")).toBe("bottom")
    expect(menu.getAttribute("data-align")).toBe("start")
    unmount()

    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const placed = await screen.findByRole("menu")
    expect(placed.getAttribute("data-align")).toBe("end")
    expect(placed.hasAttribute("data-side")).toBe(true)
  })

  it("takes a data-slot prop and a render element for the trigger, which the SDK would otherwise ignore", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-slot="issue-row-more" render={<a href="/more" />}>
          More
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    const trigger = screen.getByText("More")
    expect(trigger.tagName).toBe("A")
    expect(trigger.getAttribute("data-slot")).toBe("issue-row-more")
  })

  it("lets a checkbox item work without a value, as it did on Base UI", async () => {
    const onCheckedChange = vi.fn()
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>View</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem onCheckedChange={onCheckedChange}>Ruler</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Ruler" }))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it("marks an open menu data-open and a closed one data-closed", async () => {
    render(<Actions />)
    await open()

    expect(screen.getByRole("menu").hasAttribute("data-open")).toBe(true)
  })
})

describe("DropdownMenu: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/dropdown-menu.tsx"), "utf8")

  it("styles the highlighted item with data-highlighted, which the SDK sets", () => {
    expect(source).toContain("data-highlighted:")
  })

  it("styles with data-open and data-closed, which the SDK sets", () => {
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/menu")
  })
})

describe("DropdownMenu: accessibility", () => {
  it("passes the SDK's menu pattern check", async () => {
    render(<Actions />)
    const menu = await open()

    await checkPattern(menu, "menu")
  })

  it("has no axe violations while open", async () => {
    render(<Actions />)
    await open()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
