import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../registry/base-nova/ui/accordion"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const getTrigger = (name: string) => screen.getByRole("button", { name })

// The SDK registers each panel one microtask after mount, then points the trigger's aria-controls at it.
const settle = () => act(async () => {})

function Faq(props: React.ComponentProps<typeof Accordion>) {
  return (
    <Accordion {...props}>
      <AccordionItem value="shipping">
        <AccordionTrigger>Shipping</AccordionTrigger>
        <AccordionContent>Standard takes a week.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="returns">
        <AccordionTrigger>Returns</AccordionTrigger>
        <AccordionContent>Thirty days.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="support" disabled>
        <AccordionTrigger>Support</AccordionTrigger>
        <AccordionContent>Write to us.</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

describe("Accordion: behaviour (frontend#245, on @ui-sdk)", () => {
  it("opens a panel when its trigger is clicked", () => {
    render(<Faq />)

    const trigger = getTrigger("Shipping")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(trigger)

    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Standard takes a week.")).toBeTruthy()
  })

  it("closes the open panel when its trigger is clicked again", () => {
    render(<Faq defaultValue={["shipping"]} />)

    fireEvent.click(getTrigger("Shipping"))

    expect(getTrigger("Shipping").getAttribute("aria-expanded")).toBe("false")
  })

  it("opens the default items and nothing else", () => {
    render(<Faq defaultValue={["returns"]} />)

    expect(getTrigger("Returns").getAttribute("aria-expanded")).toBe("true")
    expect(getTrigger("Shipping").getAttribute("aria-expanded")).toBe("false")
  })

  it("opens one item at a time unless multiple is set", () => {
    const { unmount } = render(<Faq defaultValue={["shipping"]} />)

    fireEvent.click(getTrigger("Returns"))
    expect(getTrigger("Returns").getAttribute("aria-expanded")).toBe("true")
    expect(getTrigger("Shipping").getAttribute("aria-expanded")).toBe("false")
    unmount()

    render(<Faq multiple defaultValue={["shipping"]} />)
    fireEvent.click(getTrigger("Returns"))
    expect(getTrigger("Returns").getAttribute("aria-expanded")).toBe("true")
    expect(getTrigger("Shipping").getAttribute("aria-expanded")).toBe("true")
  })

  it("reports the open values first, then the reason", () => {
    const onValueChange = vi.fn()
    render(<Faq onValueChange={onValueChange} />)

    fireEvent.click(getTrigger("Returns"))

    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith(["returns"], expect.objectContaining({ reason: expect.any(String) }))
  })

  it("follows a controlled value and lets the owner refuse a change", () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Faq value={[]} onValueChange={onValueChange} />)

    fireEvent.click(getTrigger("Shipping"))
    expect(onValueChange).toHaveBeenCalledWith(["shipping"], expect.anything())
    expect(getTrigger("Shipping").getAttribute("aria-expanded")).toBe("false")

    rerender(<Faq value={["shipping"]} onValueChange={onValueChange} />)
    expect(getTrigger("Shipping").getAttribute("aria-expanded")).toBe("true")
  })

  it("links a trigger to its panel both ways", async () => {
    render(<Faq defaultValue={["shipping"]} />)
    await settle()

    const panel = screen.getByRole("region", { name: "Shipping" })
    expect(getTrigger("Shipping").getAttribute("aria-controls")).toBe(panel.id)
  })

  it("wraps each trigger in a heading", () => {
    render(<Faq />)

    expect(screen.getAllByRole("heading")).toHaveLength(3)
    expect(screen.getByRole("heading", { name: "Shipping" }).contains(getTrigger("Shipping"))).toBe(true)
  })

  it("leaves every trigger a tab stop and does not rove focus with the arrow keys", () => {
    render(<Faq />)
    const shipping = getTrigger("Shipping")
    shipping.focus()

    // APG dropped roving focus for accordions (Base UI did too): Tab moves between triggers.
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) fireEvent.keyDown(shipping, { key })

    expect(document.activeElement).toBe(shipping)
    for (const name of ["Shipping", "Returns", "Support"]) expect(getTrigger(name).tabIndex).toBe(0)
  })

  it("keeps a disabled item closed but focusable", () => {
    const onValueChange = vi.fn()
    render(<Faq onValueChange={onValueChange} />)

    fireEvent.click(getTrigger("Support"))

    expect(onValueChange).not.toHaveBeenCalled()
    expect(getTrigger("Support").getAttribute("aria-expanded")).toBe("false")
    expect(getTrigger("Support").hasAttribute("data-disabled")).toBe(true)
  })

  it("disables every item with a disabled root", () => {
    const onValueChange = vi.fn()
    render(<Faq disabled onValueChange={onValueChange} />)

    fireEvent.click(getTrigger("Shipping"))

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("keeps closed panels in the page with keepMounted", () => {
    render(<Faq keepMounted />)

    expect(screen.getByText("Thirty days.").closest("[hidden]")).toBeTruthy()
  })
})

describe("Accordion: the same component API for consumers", () => {
  it("keeps its slots, the two chevrons and className and extra props", () => {
    const { container } = render(
      <Accordion className="custom-root" data-testid="root" defaultValue={["a"]}>
        <AccordionItem value="a" className="custom-item">
          <AccordionTrigger className="custom-trigger" id="trigger-a">
            A
          </AccordionTrigger>
          <AccordionContent className="custom-content">Content A</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )

    const root = screen.getByTestId("root")
    expect(root.getAttribute("data-slot")).toBe("accordion")
    expect(root.className).toContain("custom-root")
    expect(root.className).toContain("flex-col")

    const item = container.querySelector('[data-slot="accordion-item"]') as HTMLElement
    expect(item.className).toContain("custom-item")

    const trigger = getTrigger("A")
    expect(trigger.getAttribute("data-slot")).toBe("accordion-trigger")
    expect(trigger.id).toBe("trigger-a")
    expect(trigger.className).toContain("custom-trigger")
    expect(trigger.querySelectorAll('[data-slot="accordion-trigger-icon"]')).toHaveLength(2)

    // The SDK names the panel accordion-panel; the wrapper keeps the slot consumers already target.
    const panel = container.querySelector('[data-slot="accordion-content"]') as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.getAttribute("role")).toBe("region")
    expect((panel.firstElementChild as HTMLElement).className).toContain("custom-content")
  })
})

describe("Accordion: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/accordion.tsx"), "utf8")

  it("marks the open item data-open and the closed one data-closed", () => {
    render(<Faq defaultValue={["shipping"]} />)

    expect(getTrigger("Shipping").hasAttribute("data-open")).toBe(true)
    expect(getTrigger("Returns").hasAttribute("data-closed")).toBe(true)
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
  })

  it("keys the chevron off aria-expanded on the trigger", () => {
    render(<Faq />)

    expect(source).toContain("group-aria-expanded/accordion-trigger")
    expect(getTrigger("Shipping").hasAttribute("aria-expanded")).toBe(true)
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/accordion")
  })
})

describe("Accordion: accessibility", () => {
  it("passes the SDK's accordion pattern check", async () => {
    const { container } = render(<Faq defaultValue={["shipping"]} />)
    await settle()

    await checkPattern(container, "accordion")
  })

  it("has no axe violations", async () => {
    const { container } = render(<Faq defaultValue={["shipping"]} />)

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
