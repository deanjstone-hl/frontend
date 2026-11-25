import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Alert, AlertDescription, AlertTitle } from "../registry/base-nova/ui/alert"

afterEach(cleanup)

describe("Alert", () => {
  it("announces its title and description as an alert", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription>Update the card on file.</AlertDescription>
      </Alert>,
    )

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Payment failed")
    expect(alert.textContent).toContain("Update the card on file.")
    expect(alert.getAttribute("data-slot")).toBe("alert")
  })
})

describe("Alert status variants", () => {
  it.each(["success", "warning", "critical"] as const)("%s draws an icon beside the words", (variant) => {
    render(
      <Alert variant={variant}>
        <AlertTitle>Saved</AlertTitle>
        <AlertDescription>All changes are stored.</AlertDescription>
      </Alert>,
    )

    const alert = screen.getByRole("alert")
    const icon = alert.querySelector(":scope > svg")
    expect(icon).not.toBeNull()
    expect(icon!.getAttribute("aria-hidden")).toBe("true")
    expect(alert.textContent).toContain("Saved")
  })

  it("takes a custom icon in place of the default", () => {
    render(
      <Alert variant="warning" icon={<svg data-testid="mine" />}>
        <AlertTitle>Offline</AlertTitle>
      </Alert>,
    )

    const alert = screen.getByRole("alert")
    expect(alert.querySelectorAll(":scope > svg")).toHaveLength(1)
    expect(screen.getByTestId("mine")).not.toBeNull()
  })

  it("lets a notice opt out of the icon with icon={null}", () => {
    render(
      <Alert variant="success" icon={null}>
        <AlertTitle>Saved</AlertTitle>
      </Alert>,
    )

    expect(screen.getByRole("alert").querySelector("svg")).toBeNull()
  })

  it("leaves default and destructive without an icon of their own", () => {
    render(
      <>
        <Alert data-testid="a">
          <AlertTitle>Note</AlertTitle>
        </Alert>
        <Alert variant="destructive" data-testid="b">
          <AlertTitle>Failed</AlertTitle>
        </Alert>
      </>,
    )

    expect(screen.getByTestId("a").querySelector("svg")).toBeNull()
    expect(screen.getByTestId("b").querySelector("svg")).toBeNull()
  })

  it("marks the variant on the element", () => {
    render(<Alert variant="critical">Down</Alert>)
    expect(screen.getByRole("alert").getAttribute("data-variant")).toBe("critical")
  })
})
