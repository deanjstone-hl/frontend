import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../registry/base-nova/ui/sheet"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

function Menu(props: React.ComponentProps<typeof Sheet> & { side?: "top" | "right" | "bottom" | "left"; showCloseButton?: boolean }) {
  const { side, showCloseButton, ...root } = props
  return (
    <div>
      <Sheet {...root}>
        <SheetTrigger>Menu</SheetTrigger>
        <SheetContent side={side} showCloseButton={showCloseButton}>
          <SheetHeader>
            <SheetTitle>Main menu</SheetTitle>
            <SheetDescription>Pick a section.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose>Done</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <button type="button">Outside</button>
    </div>
  )
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Menu" }))
  return screen.findByRole("dialog", { name: "Main menu" })
}

describe("Sheet: behaviour (frontend#245, on @ui-sdk)", () => {
  it("stays closed until its trigger is pressed", () => {
    render(<Menu />)

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens a modal dialog named by its title and described by its description", async () => {
    render(<Menu />)

    const sheet = await open()

    expect(sheet.getAttribute("aria-modal")).toBe("true")
    expect(document.getElementById(sheet.getAttribute("aria-describedby")!)?.textContent).toBe("Pick a section.")
  })

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Menu />)
    await open()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menu" })))
  })

  it("closes from the corner button and from a SheetClose", async () => {
    render(<Menu />)
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await open()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("closes on a press of the overlay", async () => {
    const { baseElement } = render(<Menu />)
    await open()
    const overlay = baseElement.querySelector('[data-slot="sheet-overlay"]') as HTMLElement

    fireEvent.pointerDown(overlay)
    fireEvent.mouseDown(overlay)
    fireEvent.pointerUp(overlay)
    fireEvent.mouseUp(overlay)
    fireEvent.click(overlay)

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("reports why it opened and closed through onOpenChange(open, details)", async () => {
    const onOpenChange = vi.fn()
    render(<Menu onOpenChange={onOpenChange} />)

    await open()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "close-press" })),
    )
  })

  it("follows a controlled open value", async () => {
    const { rerender } = render(<Menu open={false} />)
    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(<Menu open />)

    expect(await screen.findByRole("dialog")).toBeTruthy()
  })

  it("omits the corner close button when asked", async () => {
    render(<Menu showCloseButton={false} />)
    await open()

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
  })
})

describe("Sheet: the same component API for consumers", () => {
  it.each(["top", "right", "bottom", "left"] as const)("keeps its slot and marks the %s side", async (side) => {
    const { baseElement } = render(<Menu open side={side} />)
    const sheet = await screen.findByRole("dialog")

    expect(sheet.getAttribute("data-slot")).toBe("dialog-content")
    expect(sheet.getAttribute("data-side")).toBe(side)
    expect(baseElement.querySelector('[data-slot="sheet-overlay"]')).toBeTruthy()
  })

  it("defaults to the right side and keeps the header, footer, title and close slots", async () => {
    const { baseElement } = render(<Menu open />)
    const sheet = await screen.findByRole("dialog")

    expect(sheet.getAttribute("data-side")).toBe("right")
    for (const slot of ["sheet-header", "sheet-footer", "sheet-title", "sheet-description", "sheet-close"]) {
      expect(baseElement.querySelector(`[data-slot="${slot}"]`), slot).toBeTruthy()
    }
  })

  it("passes className and extra props to the content", async () => {
    render(
      <Sheet open>
        <SheetContent className="custom-sheet" data-testid="sheet">
          <SheetTitle>T</SheetTitle>
          <SheetDescription>D</SheetDescription>
        </SheetContent>
      </Sheet>,
    )

    const sheet = await screen.findByTestId("sheet")

    expect(sheet.className).toContain("custom-sheet")
    expect(sheet.className).toContain("bg-popover")
  })
})

describe("Sheet: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/sheet.tsx"), "utf8")

  it("slides with data-starting-style and data-ending-style, which the SDK sets", async () => {
    render(<Menu open />)

    expect((await screen.findByRole("dialog")).hasAttribute("data-starting-style")).toBe(true)
    expect(source).toContain("data-starting-style:")
    expect(source).toContain("data-ending-style:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/dialog")
  })
})

describe("Sheet: accessibility", () => {
  it("passes the SDK's dialog pattern check", async () => {
    const checkVisibility = Element.prototype.checkVisibility
    // jsdom has no layout, so the focus trap sees no visible tab stop: tell it everything is visible.
    Element.prototype.checkVisibility = () => true
    try {
      render(<Menu />)
      const sheet = await open()
      await act(async () => {})

      await checkPattern(sheet, "dialog")
    } finally {
      Element.prototype.checkVisibility = checkVisibility
    }
  })

  it("has no axe violations while open", async () => {
    render(<Menu />)
    await open()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
