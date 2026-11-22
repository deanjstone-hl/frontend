import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Toggle, toggleVariants } from "../registry/base-nova/ui/toggle"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const getToggle = (name: string) => screen.getByRole("button", { name })

// jsdom does not turn a key press on a button into a click the way a browser does: Enter clicks on
// keydown and Space on keyup, unless the page cancelled the key. The SDK relies on that native step.
const press = (element: HTMLElement, key: "Enter" | " ") => {
  const accepted = fireEvent.keyDown(element, { key })
  if (accepted && key === "Enter") fireEvent.click(element)
  const released = fireEvent.keyUp(element, { key })
  if (accepted && released && key === " ") fireEvent.click(element)
}

describe("Toggle: behaviour (frontend#245, on @ui-sdk)", () => {
  it("is not pressed until told, and starts pressed with defaultPressed", () => {
    render(
      <div>
        <Toggle aria-label="Bold" />
        <Toggle aria-label="Italic" defaultPressed />
      </div>,
    )

    expect(getToggle("Bold").getAttribute("aria-pressed")).toBe("false")
    expect(getToggle("Bold").hasAttribute("data-pressed")).toBe(false)
    expect(getToggle("Italic").getAttribute("aria-pressed")).toBe("true")
    expect(getToggle("Italic").hasAttribute("data-pressed")).toBe(true)
  })

  it("toggles on click and reports the new value first, then the reason", () => {
    const onPressedChange = vi.fn()
    render(<Toggle aria-label="Bold" onPressedChange={onPressedChange} />)

    fireEvent.click(getToggle("Bold"))
    expect(getToggle("Bold").getAttribute("aria-pressed")).toBe("true")
    expect(onPressedChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "press" }))

    fireEvent.click(getToggle("Bold"))
    expect(getToggle("Bold").getAttribute("aria-pressed")).toBe("false")
    expect(onPressedChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "press" }))
  })

  it("toggles on Enter and on Space", () => {
    render(<Toggle aria-label="Bold" />)
    const control = getToggle("Bold")
    control.focus()

    press(control, "Enter")
    expect(control.getAttribute("aria-pressed")).toBe("true")

    press(control, " ")
    expect(control.getAttribute("aria-pressed")).toBe("false")
  })

  it("follows the controlled value and lets the owner refuse a change", () => {
    const onPressedChange = vi.fn()
    const { rerender } = render(<Toggle aria-label="Bold" pressed={false} onPressedChange={onPressedChange} />)

    fireEvent.click(getToggle("Bold"))
    expect(onPressedChange).toHaveBeenCalledWith(true, expect.anything())
    expect(getToggle("Bold").getAttribute("aria-pressed")).toBe("false")

    rerender(<Toggle aria-label="Bold" pressed onPressedChange={onPressedChange} />)
    expect(getToggle("Bold").getAttribute("aria-pressed")).toBe("true")
  })

  it("ignores clicks and keys while disabled", () => {
    const onPressedChange = vi.fn()
    render(<Toggle aria-label="Bold" disabled onPressedChange={onPressedChange} />)
    const control = getToggle("Bold")

    fireEvent.click(control)
    press(control, " ")

    expect(onPressedChange).not.toHaveBeenCalled()
    expect(control.getAttribute("aria-pressed")).toBe("false")
    expect(control.hasAttribute("data-disabled") || (control as HTMLButtonElement).disabled).toBe(true)
  })

  it("never submits a form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Toggle aria-label="Bold" />
      </form>,
    )

    fireEvent.click(getToggle("Bold"))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(getToggle("Bold").getAttribute("type")).toBe("button")
  })
})

describe("Toggle: the same component API for consumers", () => {
  it("keeps its slot and passes className and extra props through", () => {
    render(<Toggle aria-label="Bold" className="custom" data-testid="mine" id="bold" />)

    const control = getToggle("Bold")
    expect(control.getAttribute("data-slot")).toBe("toggle")
    expect(control.id).toBe("bold")
    expect(control.getAttribute("data-testid")).toBe("mine")
    expect(control.className).toContain("custom")
  })

  it("defaults to the default variant and size, and takes outline and sm and lg", () => {
    const { rerender } = render(<Toggle aria-label="Bold" />)
    expect(getToggle("Bold").className).toContain("h-8")
    expect(getToggle("Bold").className).not.toContain("border-input")

    rerender(<Toggle aria-label="Bold" variant="outline" size="sm" />)
    expect(getToggle("Bold").className).toContain("border-input")
    expect(getToggle("Bold").className).toContain("h-7")

    rerender(<Toggle aria-label="Bold" size="lg" />)
    expect(getToggle("Bold").className).toContain("h-9")
  })

  it("still exports toggleVariants, which toggle-group builds on", () => {
    expect(toggleVariants({ variant: "outline", size: "lg" })).toContain("h-9")
  })
})

describe("Toggle: state styling parity", () => {
  // The pressed look keys off aria-pressed, which the SDK sets the same way.
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/toggle.tsx"), "utf8")

  it("styles the pressed state with aria-pressed", () => {
    expect(source).toContain("aria-pressed:bg-muted")
    render(<Toggle aria-label="Bold" defaultPressed />)
    expect(getToggle("Bold").getAttribute("aria-pressed")).toBe("true")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/toggle")
  })
})

describe("Toggle: accessibility", () => {
  it("has no axe violations, pressed or not, disabled or not", async () => {
    const { container } = render(
      <div>
        <Toggle aria-label="Bold" />
        <Toggle aria-label="Italic" defaultPressed />
        <Toggle aria-label="Underline" disabled />
        <Toggle>Strike</Toggle>
      </div>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
