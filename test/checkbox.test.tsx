import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Checkbox } from "../registry/base-nova/ui/checkbox"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const getCheckbox = (name: string) => screen.getByRole("checkbox", { name })

// jsdom does not turn a key press on a button into a click the way a browser does: Space clicks
// on keyup unless the page cancelled the key. The SDK relies on that native step.
const pressSpace = (element: HTMLElement) => {
  const accepted = fireEvent.keyDown(element, { key: " " })
  const released = fireEvent.keyUp(element, { key: " " })
  if (accepted && released) fireEvent.click(element)
}

describe("Checkbox: behaviour (frontend#245, on @ui-sdk)", () => {
  it("is unchecked when nothing says otherwise, and starts checked with defaultChecked", () => {
    render(
      <div>
        <Checkbox aria-label="Terms" />
        <Checkbox aria-label="Newsletter" defaultChecked />
      </div>,
    )

    expect(getCheckbox("Terms").getAttribute("aria-checked")).toBe("false")
    expect(getCheckbox("Terms").hasAttribute("data-checked")).toBe(false)
    expect(getCheckbox("Newsletter").getAttribute("aria-checked")).toBe("true")
    expect(getCheckbox("Newsletter").hasAttribute("data-checked")).toBe(true)
  })

  it("toggles on click and reports the new boolean first, then the reason", () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="Terms" onCheckedChange={onCheckedChange} />)

    fireEvent.click(getCheckbox("Terms"))
    expect(getCheckbox("Terms").getAttribute("aria-checked")).toBe("true")
    expect(onCheckedChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "press" }))

    fireEvent.click(getCheckbox("Terms"))
    expect(getCheckbox("Terms").getAttribute("aria-checked")).toBe("false")
    expect(onCheckedChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "press" }))
  })

  it("toggles when its label is clicked", () => {
    render(
      <label>
        <Checkbox />
        Accept terms
      </label>,
    )

    fireEvent.click(screen.getByText("Accept terms"))

    expect(getCheckbox("Accept terms").getAttribute("aria-checked")).toBe("true")
  })

  it("toggles on Space", () => {
    render(<Checkbox aria-label="Terms" />)
    const control = getCheckbox("Terms")
    control.focus()

    pressSpace(control)

    expect(control.getAttribute("aria-checked")).toBe("true")
  })

  it("follows the controlled value and lets the owner refuse a change", () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(<Checkbox aria-label="Terms" checked={false} onCheckedChange={onCheckedChange} />)

    fireEvent.click(getCheckbox("Terms"))
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
    expect(getCheckbox("Terms").getAttribute("aria-checked")).toBe("false")

    rerender(<Checkbox aria-label="Terms" checked onCheckedChange={onCheckedChange} />)
    expect(getCheckbox("Terms").getAttribute("aria-checked")).toBe("true")
  })

  it("shows the indicator only while checked", () => {
    const { container } = render(<Checkbox aria-label="Terms" />)
    const indicators = () => container.querySelectorAll('[data-slot="checkbox-indicator"]')

    expect(indicators()).toHaveLength(0)
    fireEvent.click(getCheckbox("Terms"))
    expect(indicators()).toHaveLength(1)
    expect(indicators()[0]!.querySelector("svg")).not.toBeNull()
  })

  it("shows a mixed state for indeterminate, and a press checks it", () => {
    const onCheckedChange = vi.fn()
    const { container } = render(<Checkbox aria-label="Select all" indeterminate onCheckedChange={onCheckedChange} />)
    const control = getCheckbox("Select all")

    expect(control.getAttribute("aria-checked")).toBe("mixed")
    expect(control.hasAttribute("data-indeterminate")).toBe(true)
    expect(container.querySelectorAll('[data-slot="checkbox-indicator"]')).toHaveLength(1)

    fireEvent.click(control)
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: "press" }))
  })

  it("ignores clicks and keys while disabled", () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="Security alerts" defaultChecked disabled onCheckedChange={onCheckedChange} />)
    const control = getCheckbox("Security alerts")

    fireEvent.click(control)
    pressSpace(control)

    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(control.getAttribute("aria-checked")).toBe("true")
    expect(control.hasAttribute("data-disabled")).toBe(true)
  })

  it("keeps a read-only checkbox focusable but unchanged", () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="Two-factor" defaultChecked readOnly onCheckedChange={onCheckedChange} />)
    const control = getCheckbox("Two-factor")

    control.focus()
    fireEvent.click(control)

    expect(document.activeElement).toBe(control)
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(control.getAttribute("aria-checked")).toBe("true")
  })

  it("lets a form submit its name and value only while checked, and a reset restore the default", async () => {
    render(
      <form aria-label="Account">
        <Checkbox aria-label="Terms" name="terms" value="yes" />
        <Checkbox aria-label="Newsletter" name="newsletter" value="weekly" defaultChecked />
      </form>,
    )
    const form = screen.getByRole("form") as HTMLFormElement
    const entries = () => [...new FormData(form)].map(([name, value]) => `${name}=${String(value)}`)

    expect(entries()).toEqual(["newsletter=weekly"])

    fireEvent.click(getCheckbox("Terms"))
    fireEvent.click(getCheckbox("Newsletter"))
    expect(entries()).toEqual(["terms=yes"])

    act(() => form.reset())
    expect(entries()).toEqual(["newsletter=weekly"])
    await waitFor(() => expect(getCheckbox("Newsletter").getAttribute("aria-checked")).toBe("true"))
    expect(getCheckbox("Terms").getAttribute("aria-checked")).toBe("false")
  })
})

describe("Checkbox: the same component API for consumers", () => {
  it("keeps its slots and passes className and extra props through", () => {
    render(<Checkbox aria-label="Terms" className="custom" data-testid="mine" id="terms" defaultChecked />)

    const control = getCheckbox("Terms")
    expect(control.getAttribute("data-slot")).toBe("checkbox")
    expect(control.id).toBe("terms")
    expect(control.getAttribute("data-testid")).toBe("mine")
    expect(control.className).toContain("custom")
    expect(control.className).toContain("size-4")
  })
})

describe("Checkbox: state-attribute styling parity", () => {
  // The Tailwind classes key off the state attributes, so the SDK must name them the same.
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/checkbox.tsx"), "utf8")

  it("styles with data-checked, which the SDK sets", () => {
    expect(source).toContain("data-checked:")
    render(<Checkbox aria-label="Terms" defaultChecked />)
    expect(getCheckbox("Terms").hasAttribute("data-checked")).toBe(true)
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/checkbox")
  })
})

describe("Checkbox: accessibility", () => {
  it("passes the SDK's checkbox pattern check", async () => {
    const { container } = render(
      <label>
        <Checkbox />
        Accept terms
      </label>,
    )

    await checkPattern(container, "checkbox")
  })

  it("has no axe violations, checked, mixed, disabled, labelled or not", async () => {
    const { container } = render(
      <div>
        <label>
          <Checkbox />
          Accept terms
        </label>
        <Checkbox aria-label="Newsletter" defaultChecked />
        <Checkbox aria-label="Select all" indeterminate />
        <Checkbox aria-label="Security alerts" defaultChecked disabled />
      </div>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
