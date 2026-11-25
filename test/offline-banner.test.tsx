import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { OfflineBanner } from "../registry/base-nova/ui/offline-banner"

// offline-banner (frontend#219): a warning alert shown only while the browser is offline. It replaces the
// OfflineBanner knowledge and reader each keep. It is a status, not an alert: going offline must not
// interrupt a screen reader. Driven by firing the `online`/`offline` events the browser fires.

const setOnLine = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value)
const fire = (type: "online" | "offline") => act(() => void window.dispatchEvent(new Event(type)))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("OfflineBanner", () => {
  it("draws nothing while online", () => {
    setOnLine(true)
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe("")
  })

  it("appears on an offline event and goes on an online event", () => {
    setOnLine(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole("status")).toBeNull()

    setOnLine(false)
    fire("offline")
    expect(screen.getByRole("status").textContent).toContain("You're offline")

    setOnLine(true)
    fire("online")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("draws at once when the page loads offline", () => {
    setOnLine(false)
    render(<OfflineBanner />)
    expect(screen.getByRole("status")).not.toBeNull()
  })

  it("is the warning alert, with its icon, as a polite status", () => {
    setOnLine(false)
    render(<OfflineBanner />)
    const banner = screen.getByRole("status")
    expect(banner.getAttribute("data-slot")).toBe("alert")
    expect(banner.getAttribute("data-variant")).toBe("warning")
    expect(banner.getAttribute("aria-live")).toBe("polite")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(banner.querySelector(":scope > svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("takes the app's own words as a title and a description", () => {
    setOnLine(false)
    render(<OfflineBanner title="Offline" description="Reading from cache" />)
    const text = screen.getByRole("status").textContent
    expect(text).toContain("Offline")
    expect(text).toContain("Reading from cache")
    expect(text).not.toContain("You're offline")
  })

  it("lets the icon be replaced or dropped, and passes className and data-* through", () => {
    setOnLine(false)
    const { rerender } = render(<OfflineBanner icon={null} className="mb-4" data-testid="banner" />)
    const banner = screen.getByTestId("banner")
    expect(banner.querySelector("svg")).toBeNull()
    expect(banner.className).toContain("mb-4")

    rerender(<OfflineBanner icon={<i data-testid="mark" />} />)
    expect(screen.getByTestId("mark")).not.toBeNull()
  })
})
