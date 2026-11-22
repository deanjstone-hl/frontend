import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../registry/base-nova/ui/popover"

afterEach(cleanup)

function Share({ onOpenChange }: { onOpenChange?: (open: boolean, details: { reason: string }) => void }) {
  return (
    <div>
      <Popover onOpenChange={onOpenChange as never}>
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Share this document</PopoverTitle>
            <PopoverDescription>Anyone with the link can view it.</PopoverDescription>
          </PopoverHeader>
          <button type="button">Copy link</button>
        </PopoverContent>
      </Popover>
      <button type="button">Outside</button>
    </div>
  )
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Share" }))
  return screen.findByRole("dialog", { name: "Share this document" })
}

describe("Popover: behaviour (frontend#245, on @ui-sdk)", () => {
  it("stays closed until its trigger is pressed", () => {
    render(<Share />)

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Share" }).getAttribute("aria-expanded")).toBe("false")
  })

  it("opens a dialog named by its title and described by its description", async () => {
    render(<Share />)

    const dialog = await open()

    expect(dialog.getAttribute("aria-describedby")).toBeTruthy()
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Anyone with the link can view it.",
    )
    expect(screen.getByRole("button", { name: "Share" }).getAttribute("aria-expanded")).toBe("true")
  })

  it("marks its trigger and content open, and gives the content its placement", async () => {
    render(<Share />)
    const trigger = screen.getByRole("button", { name: "Share" })

    expect(trigger.hasAttribute("data-closed")).toBe(true)
    const dialog = await open()

    expect(trigger.hasAttribute("data-open")).toBe(true)
    expect(dialog.hasAttribute("data-open")).toBe(true)
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(dialog.getAttribute("data-align")).toBe("center")
  })

  it("reports why it opened and closed", async () => {
    const onOpenChange = vi.fn()
    render(<Share onOpenChange={onOpenChange} />)

    await open()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" })),
    )
  })

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Share />)
    await open()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share" })))
  })

  it("closes on a press outside", async () => {
    render(<Share />)
    await open()

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }))
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }))
    fireEvent.pointerUp(screen.getByRole("button", { name: "Outside" }))
    fireEvent.click(screen.getByRole("button", { name: "Outside" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("closes when its trigger is pressed again", async () => {
    render(<Share />)
    await open()

    fireEvent.click(screen.getByRole("button", { name: "Share" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("follows a controlled open value", async () => {
    const { rerender } = render(
      <Popover open={false}>
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Share this document</PopoverTitle>
        </PopoverContent>
      </Popover>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(
      <Popover open>
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Share this document</PopoverTitle>
        </PopoverContent>
      </Popover>,
    )

    expect(await screen.findByRole("dialog", { name: "Share this document" })).toBeTruthy()
  })

  it("renders a trigger through its render prop and keeps the trigger's behaviour", async () => {
    render(
      <Popover>
        <PopoverTrigger render={<a href="#share" data-testid="link" />}>Share</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Share this document</PopoverTitle>
        </PopoverContent>
      </Popover>,
    )

    const trigger = screen.getByTestId("link")
    expect(trigger.tagName).toBe("A")
    expect(trigger.getAttribute("data-slot")).toBe("popover-trigger")
    fireEvent.click(trigger)

    expect(await screen.findByRole("dialog", { name: "Share this document" })).toBeTruthy()
  })
})

describe("Popover: the same component API for consumers", () => {
  it("keeps its slots, passes className through and takes placement props", async () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverContent className="custom w-80" side="top" align="start" sideOffset={8} alignOffset={2}>
          <PopoverHeader data-testid="header">
            <PopoverTitle>Share this document</PopoverTitle>
            <PopoverDescription>Anyone can view it.</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>,
    )

    const dialog = await screen.findByRole("dialog", { name: "Share this document" })
    expect(dialog.getAttribute("data-slot")).toBe("popover-content")
    expect(dialog.className).toContain("custom")
    expect(dialog.className).toContain("w-80")
    expect(screen.getByRole("button", { name: "Share" }).getAttribute("data-slot")).toBe("popover-trigger")
    expect(screen.getByText("Share this document").getAttribute("data-slot")).toBe("popover-title")
    expect(screen.getByText("Anyone can view it.").getAttribute("data-slot")).toBe("popover-description")
    expect(screen.getByTestId("header").getAttribute("data-slot")).toBe("popover-header")
  })

  it("defaults to the bottom, centred, as before", async () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Share this document</PopoverTitle>
        </PopoverContent>
      </Popover>,
    )

    const dialog = await screen.findByRole("dialog")
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(dialog.getAttribute("data-align")).toBe("center")
  })

  it("presents as a popover, never a sheet, unless asked", async () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Share this document</PopoverTitle>
        </PopoverContent>
      </Popover>,
    )

    expect((await screen.findByRole("dialog")).getAttribute("data-presentation")).toBe("popover")
  })
})

describe("Popover: source", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/popover.tsx"), "utf8")

  it("no longer imports Base UI, and needs no portal or positioner (the SDK uses the top layer)", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/popover")
    expect(source).not.toContain("Portal")
    expect(source).not.toContain("Positioner")
  })

  it("styles with the state attributes the SDK sets", () => {
    for (const variant of ["data-open:", "data-closed:", "data-[side=bottom]:"]) {
      expect(source).toContain(variant)
    }
  })
})

describe("Popover: accessibility", () => {
  it("has no axe violations while open", async () => {
    render(<Share />)
    await open()
    await act(async () => {})

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
