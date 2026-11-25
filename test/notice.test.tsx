import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ErrorNotice, LoadingNotice } from "../registry/base-nova/ui/notice"

afterEach(cleanup)

describe("LoadingNotice", () => {
  it("is a polite status, not an assertive alert", () => {
    render(<LoadingNotice title="Loading briefings" />)

    const notice = screen.getByRole("status")
    expect(notice.getAttribute("data-slot")).toBe("alert")
    expect(notice.getAttribute("aria-live")).toBe("polite")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(notice.textContent).toContain("Loading briefings")
  })

  it("draws a spinner beside the words that stops for reduced motion and is hidden from a screen reader", () => {
    render(<LoadingNotice title="Loading briefings" />)

    const spinner = screen.getByRole("status").querySelector(":scope > svg")
    expect(spinner).not.toBeNull()
    expect(spinner!.getAttribute("aria-hidden")).toBe("true")
    expect(spinner!.getAttribute("class")).toContain("animate-spin")
    expect(spinner!.getAttribute("class")).toContain("motion-reduce:animate-none")
  })

  it("is the default alert variant, with its description muted", () => {
    render(<LoadingNotice title="Loading briefings" description="This can take a few seconds." />)

    expect(screen.getByRole("status").getAttribute("data-variant")).toBe("default")
    const description = screen.getByText("This can take a few seconds.")
    expect(description.getAttribute("data-slot")).toBe("alert-description")
    expect(description.className).toContain("text-muted-foreground")
  })

  it("announces one status, not two", () => {
    render(<LoadingNotice title="Loading jobs" />)

    expect(screen.getAllByRole("status")).toHaveLength(1)
  })

  it("draws no description when it has none", () => {
    render(<LoadingNotice title="Loading jobs" />)

    expect(screen.getByRole("status").querySelector("[data-slot=alert-description]")).toBeNull()
  })

  it("passes className and other props to the alert", () => {
    render(<LoadingNotice title="Loading jobs" className="mt-4" data-testid="mine" />)

    const notice = screen.getByTestId("mine")
    expect(notice.className).toContain("mt-4")
    expect(notice.getAttribute("role")).toBe("status")
  })
})

describe("ErrorNotice", () => {
  it("is an alert in the critical variant, with an icon beside the words", () => {
    render(<ErrorNotice title="Couldn't load briefings" description="The hub returned 502." />)

    const notice = screen.getByRole("alert")
    expect(notice.getAttribute("data-variant")).toBe("critical")
    const icon = notice.querySelector(":scope > svg")
    expect(icon).not.toBeNull()
    expect(icon!.getAttribute("aria-hidden")).toBe("true")
    expect(notice.textContent).toContain("Couldn't load briefings")
    expect(notice.textContent).toContain("The hub returned 502.")
  })

  it("takes a custom icon in place of the default", () => {
    render(<ErrorNotice title="Offline" icon={<svg data-testid="mine" />} />)

    const notice = screen.getByRole("alert")
    expect(notice.querySelectorAll(":scope > svg")).toHaveLength(1)
    expect(screen.getByTestId("mine")).not.toBeNull()
  })

  it("draws its actions under the words, in one row that wraps", () => {
    render(
      <ErrorNotice
        title="Couldn't load jobs"
        description="Unauthorised."
        action={
          <>
            <button type="button">Try again</button>
            <button type="button">Sign out</button>
          </>
        }
      />,
    )

    const actions = screen.getByRole("alert").querySelector("[data-slot=notice-actions]")
    expect(actions).not.toBeNull()
    expect(actions!.className).toContain("flex-wrap")
    expect([...actions!.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Try again", "Sign out"])
  })

  it("draws no actions row when it has none", () => {
    render(<ErrorNotice title="Couldn't load jobs" />)

    expect(screen.getByRole("alert").querySelector("[data-slot=notice-actions]")).toBeNull()
  })

  it("draws children after the description, for a hint or a link", () => {
    render(
      <ErrorNotice title="Couldn't load briefings" description="Unreachable.">
        <a href="https://example.com">Open example.com</a>
      </ErrorNotice>,
    )

    const notice = screen.getByRole("alert")
    expect(notice.querySelector("[data-slot=notice-body] a")?.textContent).toBe("Open example.com")
  })

  it("passes className and other props to the alert", () => {
    render(<ErrorNotice title="Couldn't load jobs" className="mt-4" data-testid="mine" />)

    expect(screen.getByTestId("mine").className).toContain("mt-4")
  })
})
