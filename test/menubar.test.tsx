import { checkPattern } from "@ui-sdk/core/testing"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "../registry/base-nova/ui/menubar"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

function AppMenubar({
  onNewTab,
  ...root
}: React.ComponentProps<typeof Menubar> & { onNewTab?: () => void }) {
  return (
    <div>
      <Menubar aria-label="Application" {...root}>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarGroup>
              <MenubarLabel>Tabs</MenubarLabel>
              <MenubarItem onClick={onNewTab}>
                New tab
                <MenubarShortcut>⌘T</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>Reopen tab</MenubarItem>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Share</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Email link</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Undo</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem>Bookmarks bar</MenubarCheckboxItem>
            <MenubarRadioGroup defaultValue="100">
              <MenubarRadioItem value="100">100%</MenubarRadioItem>
              <MenubarRadioItem value="150">150%</MenubarRadioItem>
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <button type="button">Outside</button>
    </div>
  )
}

const trigger = (name: string) => screen.getByRole("menuitem", { name })
const key = (name: string, target: Element = document.activeElement as Element) =>
  fireEvent.keyDown(target, { key: name })
const openFile = async () => {
  fireEvent.click(trigger("File"))
  return screen.findByRole("menu")
}

describe("Menubar: behaviour (frontend#247, on @ui-sdk)", () => {
  it("renders a named menubar whose triggers are menu items that open menus", () => {
    render(<AppMenubar />)

    expect(screen.getByRole("menubar", { name: "Application" })).toBeTruthy()
    expect(trigger("File").getAttribute("aria-haspopup")).toBe("menu")
    expect(trigger("File").getAttribute("aria-expanded")).toBe("false")
  })

  it("is one tab stop, on its first trigger", () => {
    render(<AppMenubar />)

    expect(trigger("File").getAttribute("tabindex")).toBe("0")
    expect(trigger("Edit").getAttribute("tabindex")).toBe("-1")
    expect(trigger("View").getAttribute("tabindex")).toBe("-1")
  })

  it("moves focus between triggers with the arrow keys, Home and End", () => {
    render(<AppMenubar />)
    trigger("File").focus()

    key("ArrowRight")
    expect(document.activeElement).toBe(trigger("Edit"))
    key("End")
    expect(document.activeElement).toBe(trigger("View"))
    key("Home")
    expect(document.activeElement).toBe(trigger("File"))
  })

  it("opens a menu when its trigger is clicked and lists its items, and a second click closes it", async () => {
    render(<AppMenubar />)

    await openFile()

    expect(screen.getByRole("menuitem", { name: /New tab/ })).toBeTruthy()
    expect(trigger("File").hasAttribute("data-open")).toBe(true)
    fireEvent.click(trigger("File"))
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("opens a menu with ArrowDown on the first item", async () => {
    render(<AppMenubar />)
    trigger("File").focus()

    key("ArrowDown")

    await screen.findByRole("menu")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /New tab/ })))
  })

  it("switches to the next menu with ArrowRight while one is open", async () => {
    render(<AppMenubar />)
    await openFile()
    screen.getByRole("menuitem", { name: /New tab/ }).focus()

    key("ArrowRight")

    expect(await screen.findByRole("menuitem", { name: "Undo" })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: /New tab/ })).toBeNull()
  })

  it("switches to another menu when the pointer rests on its trigger while one is open", async () => {
    render(<AppMenubar />)
    await openFile()

    fireEvent.pointerEnter(trigger("Edit"), { pointerType: "mouse" })
    fireEvent.pointerMove(trigger("Edit"), { pointerType: "mouse" })

    expect(await screen.findByRole("menuitem", { name: "Undo" })).toBeTruthy()
  })

  it("closes on Escape and puts focus back on the trigger", async () => {
    render(<AppMenubar />)
    await openFile()
    screen.getByRole("menuitem", { name: /New tab/ }).focus()

    key("Escape")

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(document.activeElement).toBe(trigger("File"))
  })

  it("runs an item's onClick on Enter and on a click, and closes the menu", async () => {
    const onNewTab = vi.fn()
    render(<AppMenubar onNewTab={onNewTab} />)
    await openFile()
    screen.getByRole("menuitem", { name: /New tab/ }).focus()

    key("Enter")

    expect(onNewTab).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

    await openFile()
    fireEvent.click(screen.getByRole("menuitem", { name: /New tab/ }))
    expect(onNewTab).toHaveBeenCalledTimes(2)
  })

  it("does nothing when a disabled item is chosen", async () => {
    render(<AppMenubar />)
    await openFile()

    fireEvent.click(screen.getByRole("menuitem", { name: "Reopen tab" }))

    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  it("opens a submenu with ArrowRight on its trigger", async () => {
    render(<AppMenubar />)
    await openFile()
    screen.getByRole("menuitem", { name: "Share" }).focus()

    key("ArrowRight")

    expect(await screen.findByRole("menuitem", { name: "Email link" })).toBeTruthy()
  })

  it("stops every menu from opening when the whole menubar is disabled", () => {
    render(<AppMenubar disabled />)

    fireEvent.click(trigger("File"))

    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger("File").getAttribute("aria-disabled")).toBe("true")
  })

  it("reports why a menu opened and closed through onOpenChange(open, details)", async () => {
    const onOpenChange = vi.fn()
    render(
      <Menubar aria-label="Application">
        <MenubarMenu onOpenChange={onOpenChange}>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New tab</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    )

    fireEvent.click(trigger("File"))
    await screen.findByRole("menu")
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    screen.getByRole("menuitem", { name: "New tab" }).focus()
    key("Escape")
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" }))
  })
})

describe("Menubar: checkbox and radio items", () => {
  const openView = async () => {
    fireEvent.click(trigger("View"))
    return screen.findByRole("menu")
  }

  it("toggles a checkbox item, draws its check on the left and keeps the menu open", async () => {
    render(<AppMenubar />)
    await openView()
    const item = screen.getByRole("menuitemcheckbox", { name: "Bookmarks bar" })
    expect(item.querySelector("svg")).toBeNull()

    fireEvent.click(item)

    expect(screen.getByRole("menuitemcheckbox", { name: "Bookmarks bar" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("menuitemcheckbox", { name: "Bookmarks bar" }).querySelector("svg")).not.toBeNull()
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  it("chooses one radio item in its group", async () => {
    render(<AppMenubar />)
    await openView()
    expect(screen.getByRole("menuitemradio", { name: "100%" }).getAttribute("aria-checked")).toBe("true")

    fireEvent.click(screen.getByRole("menuitemradio", { name: "150%" }))

    expect(screen.getByRole("menuitemradio", { name: "150%" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("menuitemradio", { name: "100%" }).getAttribute("aria-checked")).toBe("false")
  })
})

describe("Menubar: slots", () => {
  it("keeps the data-slot values the classes and the theme target", async () => {
    render(<AppMenubar />)
    await openFile()

    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)
    expect(slot("menubar")).toBe(screen.getByRole("menubar"))
    expect(slot("menubar-trigger")).toBe(trigger("File"))
    expect(slot("menubar-content")).toBe(screen.getByRole("menu"))
    expect(slot("menubar-group")).not.toBeNull()
    expect(slot("menubar-label")?.textContent).toBe("Tabs")
    expect(slot("menubar-item")).not.toBeNull()
    expect(slot("menubar-separator")).not.toBeNull()
    expect(slot("menubar-shortcut")?.textContent).toBe("⌘T")
    expect(slot("menubar-sub-trigger")).not.toBeNull()
  })

  it("keeps the slots of the checkbox, radio and sub content parts", async () => {
    render(<AppMenubar />)
    fireEvent.click(trigger("View"))
    await screen.findByRole("menu")

    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)
    expect(slot("menubar-checkbox-item")).not.toBeNull()
    expect(slot("menubar-radio-group")).not.toBeNull()
    expect(slot("menubar-radio-item")).not.toBeNull()
  })

  it("lays the bar out as a row and merges className", () => {
    render(<AppMenubar className="mine" />)

    const bar = screen.getByRole("menubar")
    expect(bar.className).toContain("flex")
    expect(bar.className).toContain("mine")
  })
})

describe("Menubar: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/menubar.tsx"), "utf8")

  it("styles the highlighted item and an open trigger with the attributes the SDK sets", () => {
    expect(source).toContain("data-highlighted:")
    expect(source).toContain("aria-expanded:")
    expect(source).not.toMatch(/(?<![-\w])focus:/)
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/menubar")
  })
})

describe("Menubar: accessibility", () => {
  it("passes the SDK's menubar pattern check", async () => {
    render(<AppMenubar />)

    await checkPattern(screen.getByRole("menubar"), "menubar")
  })

  it("has no axe violations while a menu is open", async () => {
    render(<AppMenubar />)
    await openFile()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
