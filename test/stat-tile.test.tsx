import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RULES } from "../docs/audits/primitives-usage/scorecard.mjs"
import registry from "../registry.json"
import { StatTile } from "../registry/base-nova/ui/stat-tile"

afterEach(cleanup)

describe("StatTile", () => {
  it("draws the label over the number, as a term and its description", () => {
    const { container } = render(<StatTile label="Open PRs" value="12" />)

    const tile = container.querySelector("[data-slot=stat-tile]")!
    expect(tile.tagName).toBe("DL")
    const [label, value] = [...tile.children]
    expect(label.tagName).toBe("DT")
    expect(label.textContent).toBe("Open PRs")
    expect(value.tagName).toBe("DD")
    expect(value.textContent).toBe("12")
  })

  it("sets the label muted and small, and the number heavy with tabular figures", () => {
    render(<StatTile label="Open PRs" value="12" />)

    const label = screen.getByText("Open PRs")
    expect(label.className).toContain("text-muted-foreground")
    expect(label.className).toContain("text-xs")
    const value = screen.getByText("12")
    expect(value.className).toContain("font-semibold")
    expect(value.className).toContain("tabular-nums")
  })

  it("lets a label and a number break a word wider than the tile", () => {
    render(<StatTile label="Label" value="Value" />)

    expect(screen.getByText("Label").className).toContain("wrap-anywhere")
    expect(screen.getByText("Value").className).toContain("wrap-anywhere")
  })

  describe("size", () => {
    // hierarchy.oneLargest wants the largest text on a screen at least 1.2 times the next size down,
    // and at most two elements at it. Six equal 21px tiles fail it; one lead tile above them passes.
    it("is the default size unless the screen makes the tile lead", () => {
      const { container } = render(<StatTile label="Bills" value="6" />)

      expect(container.querySelector("[data-slot=stat-tile]")!.getAttribute("data-size")).toBe("default")
      expect(screen.getByText("6").className).toContain("text-xl")
    })

    it("sets a lead tile's number in text-3xl", () => {
      const { container } = render(<StatTile label="Left to spend" value="$420" size="lead" />)

      expect(container.querySelector("[data-slot=stat-tile]")!.getAttribute("data-size")).toBe("lead")
      expect(screen.getByText("$420").className).toContain("text-3xl")
      expect(screen.getByText("$420").className).not.toContain("text-xl")
    })

    it("leads by at least the ratio the one-largest rule asks for", () => {
      const themeItem = registry.items.find((item) => item.name === "theme")
      const theme = themeItem && "cssVars" in themeItem ? themeItem.cssVars.theme : undefined
      const rem = (name: "text-xl" | "text-3xl") => parseFloat(theme?.[name] ?? "NaN")

      expect(rem("text-3xl") / rem("text-xl")).toBeGreaterThanOrEqual(RULES.largestRatio)
    })
  })

  describe("unit", () => {
    it("sits beside the number in a smaller muted span, inside the same description", () => {
      render(<StatTile label="Range" value="342" unit="km" />)

      const unit = screen.getByText("km")
      expect(unit.getAttribute("data-slot")).toBe("stat-tile-unit")
      expect(unit.className).toContain("text-muted-foreground")
      expect(unit.className).toContain("font-normal")
      expect(unit.closest("dd")).toBe(screen.getByText("342").closest("dd"))
    })

    it("draws no unit span when there is no unit", () => {
      const { container } = render(<StatTile label="Range" value="342" />)

      expect(container.querySelector("[data-slot=stat-tile-unit]")).toBeNull()
    })
  })

  describe("delta", () => {
    it("draws the change under the number in its own description", () => {
      const { container } = render(<StatTile label="Spend" value="$1,204" delta="+2.1%" />)

      const delta = container.querySelector("[data-slot=stat-tile-delta]")!
      expect(delta.tagName).toBe("DD")
      expect(delta.textContent).toBe("+2.1%")
    })

    it("draws no delta when there is none", () => {
      const { container } = render(<StatTile label="Spend" value="$1,204" />)

      expect(container.querySelector("[data-slot=stat-tile-delta]")).toBeNull()
    })

    it("says the direction in words and an icon, never in colour alone", () => {
      const { container } = render(<StatTile label="Spend" value="$1,204" delta="+2.1%" trend="up" tone="critical" />)

      const delta = container.querySelector("[data-slot=stat-tile-delta]")!
      expect(delta.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
      const word = delta.querySelector(".sr-only")!
      expect(word.textContent?.trim()).toBe("Up")
      expect(delta.textContent).toContain("+2.1%")
    })

    it("names a falling and a flat change too", () => {
      const { container, rerender } = render(<StatTile label="Spend" value="$1,204" delta="-3%" trend="down" />)
      expect(container.querySelector("[data-slot=stat-tile-delta] .sr-only")?.textContent?.trim()).toBe("Down")

      rerender(<StatTile label="Spend" value="$1,204" delta="0%" trend="flat" />)
      expect(container.querySelector("[data-slot=stat-tile-delta] .sr-only")?.textContent?.trim()).toBe("No change")
    })

    it("draws no icon without a trend", () => {
      const { container } = render(<StatTile label="Spend" value="$1,204" delta="+2.1%" />)

      expect(container.querySelector("[data-slot=stat-tile-delta] svg")).toBeNull()
      expect(container.querySelector("[data-slot=stat-tile-delta] .sr-only")).toBeNull()
    })

    it("colours the delta from the status tokens, muted by default", () => {
      const { container, rerender } = render(<StatTile label="Spend" value="1" delta="x" />)
      const cls = () => container.querySelector("[data-slot=stat-tile-delta]")!.className

      expect(cls()).toContain("text-muted-foreground")
      rerender(<StatTile label="Spend" value="1" delta="x" tone="success" />)
      expect(cls()).toContain("text-success")
      rerender(<StatTile label="Spend" value="1" delta="x" tone="critical" />)
      expect(cls()).toContain("text-critical")
    })
  })

  describe("surface", () => {
    it("is a card-like tile by default", () => {
      const { container } = render(<StatTile label="A" value="1" />)

      const cls = container.querySelector("[data-slot=stat-tile]")!.className
      expect(cls).toContain("bg-card")
      expect(cls).toContain("ring-1")
      expect(cls).toContain("rounded-xl")
    })

    it("drops the surface when it sits inside a card already", () => {
      const { container } = render(<StatTile label="A" value="1" variant="plain" />)

      const cls = container.querySelector("[data-slot=stat-tile]")!.className
      expect(cls).not.toContain("bg-card")
      expect(cls).not.toContain("ring-1")
      expect(cls).not.toContain("p-3")
    })
  })

  it("passes className and other props to the root", () => {
    const { container } = render(<StatTile label="A" value="1" className="col-span-2" id="home-open" />)

    const tile = container.querySelector("[data-slot=stat-tile]")!
    expect(tile.className).toContain("col-span-2")
    expect(tile.id).toBe("home-open")
  })
})
