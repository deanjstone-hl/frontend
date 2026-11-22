import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../registry/base-nova/ui/alert-dialog"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

function Remove(props: React.ComponentProps<typeof AlertDialog> & { size?: "default" | "sm"; onAction?: () => void }) {
  const { size, onAction, ...root } = props
  return (
    <div>
      <AlertDialog {...root}>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
        <AlertDialogContent size={size}>
          <AlertDialogHeader>
            <AlertDialogMedia>!</AlertDialogMedia>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={onAction}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <button type="button">Outside</button>
    </div>
  )
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Delete" }))
  return screen.findByRole("alertdialog", { name: "Delete this project?" })
}

describe("AlertDialog: behaviour (frontend#245, on @ui-sdk)", () => {
  it("stays closed until its trigger is pressed", () => {
    render(<Remove />)

    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("opens a modal alert dialog named by its title and described by its description", async () => {
    render(<Remove />)

    const dialog = await open()

    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("This cannot be undone.")
  })

  it("closes from Cancel and reports why", async () => {
    const onOpenChange = vi.fn()
    render(<Remove onOpenChange={onOpenChange} />)
    await open()

    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "close-press" }))
  })

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Remove />)
    await open()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete" })))
  })

  it("does not close on a press of the backdrop", async () => {
    const { baseElement } = render(<Remove />)
    await open()
    const overlay = baseElement.querySelector('[data-slot="alert-dialog-overlay"]') as HTMLElement

    fireEvent.pointerDown(overlay)
    fireEvent.mouseDown(overlay)
    fireEvent.pointerUp(overlay)
    fireEvent.mouseUp(overlay)
    fireEvent.click(overlay)
    await act(async () => {})

    expect(screen.queryByRole("alertdialog")).toBeTruthy()
  })

  it("runs the action button's own click and leaves closing to the owner", async () => {
    const onAction = vi.fn()
    render(<Remove onAction={onAction} />)
    await open()

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alertdialog")).toBeTruthy()
  })

  it("follows a controlled open value", async () => {
    const { rerender } = render(<Remove open={false} />)
    expect(screen.queryByRole("alertdialog")).toBeNull()

    rerender(<Remove open />)

    expect(await screen.findByRole("alertdialog")).toBeTruthy()
  })
})

describe("AlertDialog: the same component API for consumers", () => {
  it("keeps its slots, size and className", async () => {
    const { baseElement } = render(<Remove open size="sm" />)
    const dialog = await screen.findByRole("alertdialog")

    expect(dialog.getAttribute("data-slot")).toBe("alert-dialog-content")
    expect(dialog.getAttribute("data-size")).toBe("sm")
    expect(dialog.className).toContain("rounded-xl")
    for (const slot of ["alert-dialog-overlay", "alert-dialog-header", "alert-dialog-footer", "alert-dialog-media", "alert-dialog-title", "alert-dialog-description", "alert-dialog-action", "alert-dialog-cancel"]) {
      expect(baseElement.querySelector(`[data-slot="${slot}"]`), slot).toBeTruthy()
    }
  })

  it("defaults the size to default", async () => {
    render(<Remove open />)

    expect((await screen.findByRole("alertdialog")).getAttribute("data-size")).toBe("default")
  })
})

describe("AlertDialog: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/alert-dialog.tsx"), "utf8")

  it("styles with data-open and data-closed, which the SDK sets", async () => {
    render(<Remove open />)

    expect((await screen.findByRole("alertdialog")).hasAttribute("data-open")).toBe(true)
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/alert-dialog")
  })
})

describe("AlertDialog: accessibility", () => {
  it("passes the SDK's alertdialog pattern check", async () => {
    const checkVisibility = Element.prototype.checkVisibility
    // jsdom has no layout, so the focus trap sees no visible tab stop: tell it everything is visible.
    Element.prototype.checkVisibility = () => true
    try {
      render(<Remove />)
      const dialog = await open()
      await act(async () => {})

      await checkPattern(dialog, "alertdialog")
    } finally {
      Element.prototype.checkVisibility = checkVisibility
    }
  })

  it("has no axe violations while open", async () => {
    render(<Remove />)
    await open()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
