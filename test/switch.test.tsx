import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Switch } from "../registry/base-nova/ui/switch"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const getSwitch = (name: string) => screen.getByRole("switch", { name })

// jsdom does not turn a key press on a button into a click the way a browser does: Enter clicks on
// keydown and Space on keyup, unless the page cancelled the key. The SDK relies on that native step.
const press = (element: HTMLElement, key: "Enter" | " ") => {
  const accepted = fireEvent.keyDown(element, { key })
  if (accepted && key === "Enter") fireEvent.click(element)
  const released = fireEvent.keyUp(element, { key })
  if (accepted && released && key === " ") fireEvent.click(element)
}

describe("Switch: behaviour (frontend#245, on @ui-sdk)", () => {
  it("starts in its default state", () => {
    render(<Switch aria-label="Airplane mode" defaultChecked />)

    const control = getSwitch("Airplane mode")
    expect(control.getAttribute("aria-checked")).toBe("true")
    expect(control.hasAttribute("data-checked")).toBe(true)
    expect(control.hasAttribute("data-unchecked")).toBe(false)
  })

  it("is off when nothing says otherwise", () => {
    render(<Switch aria-label="Airplane mode" />)

    const control = getSwitch("Airplane mode")
    expect(control.getAttribute("aria-checked")).toBe("false")
    expect(control.hasAttribute("data-unchecked")).toBe(true)
  })

  it("toggles on click and reports the new value first, then the reason", () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Airplane mode" onCheckedChange={onCheckedChange} />)

    fireEvent.click(getSwitch("Airplane mode"))

    expect(getSwitch("Airplane mode").getAttribute("aria-checked")).toBe("true")
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: "press" }))
  })

  it("toggles when its label is clicked", () => {
    render(
      <label>
        Airplane mode
        <Switch />
      </label>,
    )

    fireEvent.click(screen.getByText("Airplane mode"))

    expect(getSwitch("Airplane mode").getAttribute("aria-checked")).toBe("true")
  })

  it("toggles on Space and never on Enter", () => {
    render(<Switch aria-label="Airplane mode" />)
    const control = getSwitch("Airplane mode")
    control.focus()

    press(control, "Enter")
    expect(control.getAttribute("aria-checked")).toBe("false")

    press(control, " ")
    expect(control.getAttribute("aria-checked")).toBe("true")
  })

  it("follows the controlled value and lets the owner refuse a change", () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(<Switch aria-label="Airplane mode" checked={false} onCheckedChange={onCheckedChange} />)

    fireEvent.click(getSwitch("Airplane mode"))
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
    expect(getSwitch("Airplane mode").getAttribute("aria-checked")).toBe("false")

    rerender(<Switch aria-label="Airplane mode" checked onCheckedChange={onCheckedChange} />)
    expect(getSwitch("Airplane mode").getAttribute("aria-checked")).toBe("true")
  })

  it("ignores clicks and keys while disabled", () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Security alerts" defaultChecked disabled onCheckedChange={onCheckedChange} />)
    const control = getSwitch("Security alerts")

    fireEvent.click(control)
    press(control, " ")

    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(control.getAttribute("aria-checked")).toBe("true")
    expect(control.hasAttribute("data-disabled")).toBe(true)
  })

  it("keeps a read-only switch focusable but unchanged", () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Encrypt backups" defaultChecked readOnly onCheckedChange={onCheckedChange} />)
    const control = getSwitch("Encrypt backups")

    control.focus()
    fireEvent.click(control)

    expect(document.activeElement).toBe(control)
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(control.getAttribute("aria-checked")).toBe("true")
  })

  it("lets a form submit its name and value only while on, and a reset restore the default", async () => {
    render(
      <form aria-label="Notifications">
        <Switch aria-label="Product updates" name="updates" />
        <Switch aria-label="Weekly digest" name="digest" value="weekly" defaultChecked />
      </form>,
    )
    const form = screen.getByRole("form") as HTMLFormElement
    const entries = () => [...new FormData(form)].map(([name, value]) => `${name}=${String(value)}`)

    expect(entries()).toEqual(["digest=weekly"])

    fireEvent.click(getSwitch("Product updates"))
    fireEvent.click(getSwitch("Weekly digest"))
    expect(entries()).toEqual(["updates=on"])

    act(() => form.reset())
    expect(entries()).toEqual(["digest=weekly"])
    await waitFor(() => expect(getSwitch("Weekly digest").getAttribute("aria-checked")).toBe("true"))
    expect(getSwitch("Product updates").getAttribute("aria-checked")).toBe("false")
  })

  it("moves the thumb's state with the switch", () => {
    const { container } = render(<Switch aria-label="Airplane mode" />)
    const thumb = container.querySelector('[data-slot="switch-thumb"]')!

    expect(thumb.hasAttribute("data-unchecked")).toBe(true)
    fireEvent.click(getSwitch("Airplane mode"))
    expect(thumb.hasAttribute("data-checked")).toBe(true)
    expect(thumb.hasAttribute("data-unchecked")).toBe(false)
  })
})

describe("Switch: the same component API for consumers", () => {
  it("keeps its slots and passes className and extra props through", () => {
    const { container } = render(<Switch aria-label="Airplane mode" className="custom" data-testid="mine" id="airplane" />)

    const control = getSwitch("Airplane mode")
    expect(control.getAttribute("data-slot")).toBe("switch")
    expect(control.id).toBe("airplane")
    expect(control.getAttribute("data-testid")).toBe("mine")
    expect(control.className).toContain("custom")
    expect(container.querySelectorAll('[data-slot="switch-thumb"]')).toHaveLength(1)
  })

  it("defaults to the default size and takes sm", () => {
    const { rerender } = render(<Switch aria-label="Airplane mode" />)
    expect(getSwitch("Airplane mode").getAttribute("data-size")).toBe("default")

    rerender(<Switch aria-label="Airplane mode" size="sm" />)
    expect(getSwitch("Airplane mode").getAttribute("data-size")).toBe("sm")
  })
})

describe("Switch: state-attribute styling parity", () => {
  // The Tailwind classes key off the state attributes, so the SDK must name them the same.
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/switch.tsx"), "utf8")

  it("styles with data-checked, data-unchecked and data-disabled, which the SDK sets", () => {
    for (const variant of ["data-checked:", "data-unchecked:", "data-disabled:"]) {
      expect(source).toContain(variant)
    }
    const { container } = render(<Switch aria-label="Airplane mode" defaultChecked disabled />)
    const thumb = container.querySelector('[data-slot="switch-thumb"]')!
    for (const element of [getSwitch("Airplane mode"), thumb]) {
      expect(element.hasAttribute("data-checked")).toBe(true)
      expect(element.hasAttribute("data-disabled")).toBe(true)
    }
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/switch")
  })
})

describe("Switch: accessibility", () => {
  it("passes the SDK's switch pattern check, in both states", async () => {
    const { container } = render(
      <label>
        Airplane mode
        <Switch />
      </label>,
    )

    await checkPattern(container, "switch")
  })

  it("has no axe violations, on or off, labelled or in a field", async () => {
    const { container } = render(
      <div>
        <label>
          Airplane mode
          <Switch />
        </label>
        <Switch aria-label="Security alerts" defaultChecked disabled />
        <Switch aria-label="Compact" size="sm" />
      </div>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
