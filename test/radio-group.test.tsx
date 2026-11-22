import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RadioGroup, RadioGroupItem } from "../registry/base-nova/ui/radio-group"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const getRadio = (name: string) => screen.getByRole("radio", { name })

function Speeds(props: React.ComponentProps<typeof RadioGroup>) {
  return (
    <RadioGroup aria-label="Shipping speed" {...props}>
      <label>
        <RadioGroupItem value="standard" />
        Standard
      </label>
      <label>
        <RadioGroupItem value="express" />
        Express
      </label>
      <label>
        <RadioGroupItem value="overnight" disabled />
        Overnight
      </label>
    </RadioGroup>
  )
}

describe("RadioGroup: behaviour (frontend#245, on @ui-sdk)", () => {
  it("checks the default value and nothing else", () => {
    render(<Speeds defaultValue="express" />)

    expect(getRadio("Express").getAttribute("aria-checked")).toBe("true")
    expect(getRadio("Express").hasAttribute("data-checked")).toBe(true)
    expect(getRadio("Standard").getAttribute("aria-checked")).toBe("false")
    expect(getRadio("Standard").hasAttribute("data-unchecked")).toBe(true)
  })

  it("checks a radio on click and reports the value first, then the reason", () => {
    const onValueChange = vi.fn()
    render(<Speeds defaultValue="standard" onValueChange={onValueChange} />)

    fireEvent.click(getRadio("Express"))

    expect(getRadio("Express").getAttribute("aria-checked")).toBe("true")
    expect(getRadio("Standard").getAttribute("aria-checked")).toBe("false")
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith("express", expect.objectContaining({ reason: expect.any(String) }))
  })

  it("checks a radio when its label is clicked", () => {
    render(<Speeds />)

    fireEvent.click(screen.getByText("Express"))

    expect(getRadio("Express").getAttribute("aria-checked")).toBe("true")
  })

  it("moves the choice with the arrow keys, skipping a disabled radio", () => {
    render(<Speeds defaultValue="standard" />)
    const standard = getRadio("Standard")
    standard.focus()

    fireEvent.keyDown(standard, { key: "ArrowDown" })
    expect(getRadio("Express").getAttribute("aria-checked")).toBe("true")
    expect(document.activeElement).toBe(getRadio("Express"))

    fireEvent.keyDown(getRadio("Express"), { key: "ArrowDown" })
    expect(getRadio("Standard").getAttribute("aria-checked")).toBe("true")
    expect(getRadio("Overnight").getAttribute("aria-checked")).toBe("false")
  })

  it("gives the group one tab stop, on the checked radio", () => {
    render(<Speeds defaultValue="express" />)

    expect(getRadio("Express").tabIndex).toBe(0)
    expect(getRadio("Standard").tabIndex).toBe(-1)
  })

  it("follows the controlled value and lets the owner refuse a change", () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Speeds value="standard" onValueChange={onValueChange} />)

    fireEvent.click(getRadio("Express"))
    expect(onValueChange).toHaveBeenCalledWith("express", expect.anything())
    expect(getRadio("Standard").getAttribute("aria-checked")).toBe("true")

    rerender(<Speeds value="express" onValueChange={onValueChange} />)
    expect(getRadio("Express").getAttribute("aria-checked")).toBe("true")
  })

  it("ignores clicks on a disabled radio and on a disabled group", () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Speeds defaultValue="standard" onValueChange={onValueChange} />)

    fireEvent.click(getRadio("Overnight"))
    expect(onValueChange).not.toHaveBeenCalled()

    rerender(<Speeds defaultValue="standard" disabled onValueChange={onValueChange} />)
    fireEvent.click(getRadio("Express"))
    expect(onValueChange).not.toHaveBeenCalled()
    expect(getRadio("Standard").getAttribute("aria-checked")).toBe("true")
  })

  it("keeps a read-only group focusable but unchanged", () => {
    const onValueChange = vi.fn()
    render(<Speeds defaultValue="standard" readOnly onValueChange={onValueChange} />)

    fireEvent.click(getRadio("Express"))

    expect(onValueChange).not.toHaveBeenCalled()
    expect(getRadio("Standard").getAttribute("aria-checked")).toBe("true")
  })

  it("lets a form submit the checked value and a reset restore the default", async () => {
    render(
      <form aria-label="Order">
        <Speeds name="speed" defaultValue="standard" />
      </form>,
    )
    const form = screen.getByRole("form") as HTMLFormElement
    const entries = () => [...new FormData(form)].map(([name, value]) => `${name}=${String(value)}`)

    expect(entries()).toEqual(["speed=standard"])

    fireEvent.click(getRadio("Express"))
    expect(entries()).toEqual(["speed=express"])

    act(() => form.reset())
    expect(entries()).toEqual(["speed=standard"])
    await waitFor(() => expect(getRadio("Standard").getAttribute("aria-checked")).toBe("true"))
  })

  it("shows the dot only inside the checked radio", () => {
    const { container } = render(<Speeds defaultValue="standard" />)
    const dots = () => container.querySelectorAll('[data-slot="radio-indicator"]')

    expect(dots()).toHaveLength(1)
    expect(getRadio("Standard").contains(dots()[0]!)).toBe(true)

    fireEvent.click(getRadio("Express"))
    expect(dots()).toHaveLength(1)
    expect(getRadio("Express").contains(dots()[0]!)).toBe(true)
  })
})

describe("RadioGroup: the same component API for consumers", () => {
  it("keeps its slots and passes className and extra props through", () => {
    render(
      <RadioGroup aria-label="Plan" className="custom-group" data-testid="group" defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" className="custom-item" id="plan-a" />
      </RadioGroup>,
    )

    const group = screen.getByRole("radiogroup")
    expect(group.getAttribute("data-slot")).toBe("radio-group")
    expect(group.getAttribute("data-testid")).toBe("group")
    expect(group.className).toContain("custom-group")
    expect(group.className).toContain("grid")

    const item = getRadio("A")
    // The SDK names the part's slot itself: it was radio-group-item and radio-group-indicator on Base UI.
    expect(item.getAttribute("data-slot")).toBe("radio")
    expect(item.id).toBe("plan-a")
    expect(item.className).toContain("custom-item")
    expect(item.className).toContain("rounded-full")
  })
})

describe("RadioGroup: state-attribute styling parity", () => {
  // The Tailwind classes key off the state attributes, so the SDK must name them the same.
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/radio-group.tsx"), "utf8")

  it("styles with data-checked, which the SDK sets", () => {
    expect(source).toContain("data-checked:")
    render(<Speeds defaultValue="express" />)
    expect(getRadio("Express").hasAttribute("data-checked")).toBe(true)
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/radio")
  })
})

describe("RadioGroup: accessibility", () => {
  it("passes the SDK's radio-group pattern check", async () => {
    const { container } = render(<Speeds defaultValue="standard" />)

    await checkPattern(container, "radio-group")
  })

  it("has no axe violations, labelled or not, with a disabled radio", async () => {
    const { container } = render(
      <div>
        <Speeds defaultValue="standard" />
        <RadioGroup aria-label="Plan" defaultValue="a">
          <RadioGroupItem value="a" aria-label="A" />
          <RadioGroupItem value="b" aria-label="B" />
        </RadioGroup>
      </div>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
