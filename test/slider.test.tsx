import { checkPattern } from "@ui-sdk/core/testing"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Slider } from "../registry/base-nova/ui/slider"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const thumbs = () => screen.getAllByRole("slider") as HTMLInputElement[]

describe("Slider: behaviour (frontend#245, on @ui-sdk)", () => {
  it("renders one thumb for a number and one per value for a range", () => {
    const { unmount } = render(<Slider aria-label="Volume" defaultValue={[40]} />)
    expect(thumbs()).toHaveLength(1)
    expect(thumbs()[0]!.value).toBe("40")
    unmount()

    render(<Slider aria-label="Price" defaultValue={[20, 80]} />)
    expect(thumbs()).toHaveLength(2)
    expect(thumbs().map((thumb) => thumb.value)).toEqual(["20", "80"])
  })

  it("renders one thumb for a plain number and reports a number back", () => {
    const onValueChange = vi.fn()
    render(<Slider aria-label="Volume" defaultValue={40} onValueChange={onValueChange} />)
    const thumb = thumbs()[0]!
    thumb.focus()

    expect(thumbs()).toHaveLength(1)
    fireEvent.keyDown(thumb, { key: "ArrowRight" })
    expect(onValueChange).toHaveBeenCalledWith(41, expect.anything())
  })

  it("defaults to a range over min and max when there is no value", () => {
    render(<Slider aria-label="Range" min={10} max={50} />)

    expect(thumbs().map((thumb) => thumb.value)).toEqual(["10", "50"])
  })

  it("exposes min, max and the current value to assistive tech", () => {
    render(<Slider aria-label="Volume" defaultValue={[40]} min={0} max={200} />)

    const thumb = thumbs()[0]!
    expect(thumb.min).toBe("0")
    expect(thumb.max).toBe("200")
    expect(thumb.value).toBe("40")
  })

  it("steps with the arrow keys and reports the value first, then the reason", () => {
    const onValueChange = vi.fn()
    render(<Slider aria-label="Volume" defaultValue={[40]} onValueChange={onValueChange} />)
    const thumb = thumbs()[0]!
    thumb.focus()

    fireEvent.keyDown(thumb, { key: "ArrowRight" })
    expect(thumb.value).toBe("41")
    expect(onValueChange).toHaveBeenCalledWith([41], expect.objectContaining({ reason: expect.any(String) }))

    fireEvent.keyDown(thumb, { key: "ArrowLeft" })
    fireEvent.keyDown(thumb, { key: "ArrowDown" })
    expect(thumb.value).toBe("39")
  })

  it("honours a custom step and jumps with Home, End and Page keys", () => {
    render(<Slider aria-label="Volume" defaultValue={[50]} step={5} />)
    const thumb = thumbs()[0]!
    thumb.focus()

    fireEvent.keyDown(thumb, { key: "ArrowRight" })
    expect(thumb.value).toBe("55")

    fireEvent.keyDown(thumb, { key: "End" })
    expect(thumb.value).toBe("100")

    fireEvent.keyDown(thumb, { key: "Home" })
    expect(thumb.value).toBe("0")

    fireEvent.keyDown(thumb, { key: "PageUp" })
    expect(thumb.value).toBe("50")
  })

  it("never leaves the min and max", () => {
    render(<Slider aria-label="Volume" defaultValue={[99]} />)
    const thumb = thumbs()[0]!
    thumb.focus()

    fireEvent.keyDown(thumb, { key: "ArrowRight" })
    fireEvent.keyDown(thumb, { key: "ArrowRight" })

    expect(thumb.value).toBe("100")
  })

  it("keeps the thumbs of a range in order", () => {
    render(<Slider aria-label="Price" defaultValue={[20, 25]} />)
    const [low, high] = thumbs()
    high!.focus()

    fireEvent.keyDown(high!, { key: "Home" })

    expect(low!.value).toBe("20")
    expect(Number(high!.value)).toBeGreaterThanOrEqual(20)
  })

  it("follows a controlled value and lets the owner refuse a change", () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Slider aria-label="Volume" value={[40]} onValueChange={onValueChange} />)
    const thumb = thumbs()[0]!
    thumb.focus()

    fireEvent.keyDown(thumb, { key: "ArrowRight" })
    expect(onValueChange).toHaveBeenCalled()
    expect(thumbs()[0]!.value).toBe("40")

    rerender(<Slider aria-label="Volume" value={[60]} onValueChange={onValueChange} />)
    expect(thumbs()[0]!.value).toBe("60")
  })

  it("ignores keys when disabled", () => {
    const onValueChange = vi.fn()
    render(<Slider aria-label="Volume" defaultValue={[40]} disabled onValueChange={onValueChange} />)
    const thumb = thumbs()[0]!

    fireEvent.keyDown(thumb, { key: "ArrowRight" })

    expect(onValueChange).not.toHaveBeenCalled()
    expect(thumb.disabled).toBe(true)
  })

  it("lets a form submit the value under its name", () => {
    render(
      <form aria-label="Mix">
        <Slider aria-label="Volume" name="volume" defaultValue={[40]} />
      </form>,
    )
    const form = screen.getByRole("form") as HTMLFormElement

    expect([...new FormData(form)].map(([name, value]) => `${name}=${String(value)}`)).toEqual(["volume=40"])
  })

  it("is vertical when asked and says so", () => {
    render(<Slider aria-label="Volume" defaultValue={[40]} orientation="vertical" />)

    expect(thumbs()[0]!.getAttribute("aria-orientation") ?? thumbs()[0]!.closest("[data-orientation]")?.getAttribute("data-orientation")).toBe("vertical")
  })
})

describe("Slider: the same component API for consumers", () => {
  it("keeps its slots and passes className and extra props through", () => {
    const { container } = render(
      <Slider aria-label="Volume" className="custom-root" data-testid="root" defaultValue={[40]} />,
    )

    const root = screen.getByTestId("root")
    expect(root.getAttribute("data-slot")).toBe("slider")
    expect(root.className).toContain("custom-root")
    expect(root.className).toContain("data-[orientation=horizontal]:w-full")
    expect(root.getAttribute("data-orientation")).toBe("horizontal")

    expect(container.querySelector('[data-slot="slider-track"]')).toBeTruthy()
    // The SDK names the indicator slider-indicator; the wrapper keeps slider-range.
    expect(container.querySelector('[data-slot="slider-range"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="slider-thumb"]')).toBeTruthy()
  })

  it("gives each thumb of a range its own slot element", () => {
    const { container } = render(<Slider aria-label="Price" defaultValue={[20, 80]} />)

    expect(container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(2)
  })

  it("names each thumb of a range with thumbLabels", () => {
    render(<Slider aria-label="Price" thumbLabels={["Minimum price", "Maximum price"]} defaultValue={[20, 80]} />)

    expect(screen.getByRole("slider", { name: "Minimum price" })).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Maximum price" })).toBeTruthy()
  })

  it("keeps the thumb label on the thumb: the root aria-label names a single slider", () => {
    render(<Slider aria-label="Volume" defaultValue={[40]} />)

    expect(screen.getByRole("slider", { name: "Volume" })).toBeTruthy()
  })
})

describe("Slider: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/slider.tsx"), "utf8")

  it("marks a disabled slider data-disabled on the control, which the classes key off", () => {
    const { container } = render(<Slider aria-label="Volume" defaultValue={[40]} disabled />)

    expect(container.querySelector('[data-slot="slider"]')!.hasAttribute("data-disabled")).toBe(true)
    expect(source).toContain("data-disabled:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/slider")
  })
})

describe("Slider: accessibility", () => {
  it("passes the SDK's slider pattern check", async () => {
    const { container } = render(<Slider aria-label="Volume" defaultValue={[40]} />)

    await checkPattern(container, "slider")
  })

  it("has no axe violations, single and range", async () => {
    const { container } = render(
      <div>
        <Slider aria-label="Volume" defaultValue={[40]} />
        <Slider aria-label="Price" defaultValue={[20, 80]} />
      </div>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
