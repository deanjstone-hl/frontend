import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../registry/base-nova/ui/dialog"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

function Rename(props: React.ComponentProps<typeof Dialog> & { showCloseButton?: boolean }) {
  const { showCloseButton, ...root } = props
  return (
    <div>
      <Dialog {...root}>
        <DialogTrigger>Rename</DialogTrigger>
        <DialogContent showCloseButton={showCloseButton}>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>Pick a new name.</DialogDescription>
          </DialogHeader>
          <input aria-label="Name" defaultValue="Apollo" />
          <DialogFooter>
            <DialogClose value="cancel">Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <button type="button">Outside</button>
    </div>
  )
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Rename" }))
  return screen.findByRole("dialog", { name: "Rename project" })
}

describe("Dialog: behaviour (frontend#245, on @ui-sdk)", () => {
  it("stays closed until its trigger is pressed", () => {
    render(<Rename />)

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Rename" }).hasAttribute("data-closed")).toBe(true)
  })

  it("opens a modal dialog named by its title and described by its description", async () => {
    render(<Rename />)

    const dialog = await open()

    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("Pick a new name.")
    expect(screen.getByRole("button", { name: "Rename" }).hasAttribute("data-open")).toBe(true)
  })

  it("moves focus into the dialog and marks its content open", async () => {
    render(<Rename />)

    const dialog = await open()

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    expect(dialog.hasAttribute("data-open")).toBe(true)
  })

  it("reports why it opened and closed", async () => {
    const onOpenChange = vi.fn()
    render(<Rename onOpenChange={onOpenChange} />)

    await open()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" })),
    )
  })

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Rename />)
    await open()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rename" })))
  })

  it("closes with the corner close button, which is named Close", async () => {
    render(<Rename />)
    await open()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("reports a Close part's value as the return value", async () => {
    const onOpenChange = vi.fn()
    render(<Rename onOpenChange={onOpenChange} />)
    await open()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() =>
      expect(onOpenChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ reason: "close-press", returnValue: "cancel" }),
      ),
    )
  })

  it("closes on a press of the backdrop", async () => {
    const { baseElement } = render(<Rename />)
    await open()
    const overlay = baseElement.querySelector('[data-slot="dialog-overlay"]') as HTMLElement

    fireEvent.pointerDown(overlay)
    fireEvent.mouseDown(overlay)
    fireEvent.pointerUp(overlay)
    fireEvent.mouseUp(overlay)
    fireEvent.click(overlay)

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("follows a controlled open value and lets the owner refuse a close", async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Rename open onOpenChange={onOpenChange} />)
    await screen.findByRole("dialog")

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything()))
    expect(screen.queryByRole("dialog")).toBeTruthy()

    rerender(<Rename open={false} onOpenChange={onOpenChange} />)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("omits the corner close button and its clearance when asked", async () => {
    render(<Rename showCloseButton={false} />)
    const dialog = await open()

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
    expect(dialog.hasAttribute("data-close-button")).toBe(false)
  })

  it("can add a Close button to the footer", async () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    )
    await screen.findByRole("dialog")

    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy()
  })
})

describe("Dialog: the same component API for consumers", () => {
  it("keeps its slots and passes className and extra props through", async () => {
    const { baseElement } = render(
      <Dialog open>
        <DialogContent className="custom-content" data-testid="content">
          <DialogHeader className="custom-header">
            <DialogTitle className="custom-title">T</DialogTitle>
            <DialogDescription className="custom-description">D</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )

    const content = await screen.findByTestId("content")
    expect(content.getAttribute("data-slot")).toBe("dialog-content")
    expect(content.className).toContain("custom-content")
    expect(content.className).toContain("rounded-xl")
    expect(content.hasAttribute("data-close-button")).toBe(true)

    expect(baseElement.querySelector('[data-slot="dialog-overlay"]')).toBeTruthy()
    expect(baseElement.querySelector('[data-slot="dialog-header"]')?.className).toContain("custom-header")
    expect(baseElement.querySelector('[data-slot="dialog-title"]')?.className).toContain("custom-title")
    expect(baseElement.querySelector('[data-slot="dialog-description"]')?.className).toContain("custom-description")
  })

  it("keeps the dialog-close slot on the corner close button, which the theme's touch floor targets", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    await screen.findByRole("dialog")

    expect(screen.getByRole("button", { name: "Close" }).getAttribute("data-slot")).toBe("dialog-close")
  })

  it("names the trigger's slot dialog-trigger", () => {
    render(<Rename />)

    expect(screen.getByRole("button", { name: "Rename" }).getAttribute("data-slot")).toBe("dialog-trigger")
  })
})

describe("Dialog: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/dialog.tsx"), "utf8")

  it("styles with data-open and data-closed, which the SDK sets", () => {
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/dialog")
  })
})

describe("Dialog: accessibility", () => {
  it("passes the SDK's dialog pattern check", async () => {
    // jsdom has no layout, so the focus trap sees no visible tab stop: tell it everything is visible.
    const checkVisibility = Element.prototype.checkVisibility
    Element.prototype.checkVisibility = () => true
    try {
      render(<Rename />)
      const dialog = await open()
      await act(async () => {})

      await checkPattern(dialog, "dialog")
    } finally {
      Element.prototype.checkVisibility = checkVisibility
    }
  })

  it("has no axe violations while open", async () => {
    render(<Rename />)
    await open()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
