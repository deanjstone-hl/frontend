import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CopyButton } from "../registry/base-nova/ui/copy-button"

// copy-button (frontend#220): copies a value, shows a copied state, says so to a screen reader, and takes the
// Button's 44px coarse-pointer floor. It replaces the SHA button in ops-hub's promotion-parts and email's
// CopyField. The clipboard is stubbed: success resolves, failure rejects, and an insecure context has none.

const stubClipboard = (writeText: unknown) => vi.stubGlobal("navigator", { clipboard: writeText ? { writeText } : undefined })
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
  })
}
const status = () => document.querySelector('[data-slot="copy-button-status"]')!

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("CopyButton on success", () => {
  it("writes its value to the clipboard once per click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyButton value="9f8e7d6" />)

    await click("Copy")

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith("9f8e7d6")
  })

  it("shows the copied state, then goes back after two seconds", async () => {
    vi.useFakeTimers()
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton value="x" />)
    const button = screen.getByRole("button", { name: "Copy" })
    expect(button.getAttribute("data-state")).toBe("idle")

    await click("Copy")
    expect(button.getAttribute("data-state")).toBe("copied")

    await act(async () => {
      vi.advanceTimersByTime(1999)
    })
    expect(button.getAttribute("data-state")).toBe("copied")
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(button.getAttribute("data-state")).toBe("idle")
  })

  it("announces the copy in a polite status region that is already in the page before the click", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton value="x" />)
    expect(status().getAttribute("role")).toBe("status")
    expect(status().getAttribute("aria-live")).toBe("polite")
    expect(status().textContent).toBe("")

    await click("Copy")

    expect(status().textContent).toBe("Copied")
  })

  it("keeps an icon-only button's name steady, so the live region is the only announcer", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton value="x" />)

    await click("Copy")

    expect(screen.getByRole("button", { name: "Copy" })).not.toBeNull()
  })

  it("restarts the reset timer when it is clicked again while copied", async () => {
    vi.useFakeTimers()
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton value="x" />)
    const button = screen.getByRole("button", { name: "Copy" })

    await click("Copy")
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await click("Copy")
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(button.getAttribute("data-state")).toBe("copied")
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(button.getAttribute("data-state")).toBe("idle")
  })

  it("calls onCopy with the value", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    const onCopy = vi.fn()
    render(<CopyButton value="abc" onCopy={onCopy} />)

    await click("Copy")

    expect(onCopy).toHaveBeenCalledExactlyOnceWith("abc")
  })
})

describe("CopyButton on failure", () => {
  it("shows the failed state and announces it when the clipboard rejects", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")))
    render(<CopyButton value="x" />)

    await click("Copy")

    expect(screen.getByRole("button", { name: "Copy" }).getAttribute("data-state")).toBe("failed")
    expect(status().textContent).toBe("Couldn't copy")
  })

  it("fails the same way where there is no clipboard (an insecure page)", async () => {
    stubClipboard(undefined)
    render(<CopyButton value="x" />)

    await click("Copy")

    expect(screen.getByRole("button", { name: "Copy" }).getAttribute("data-state")).toBe("failed")
    expect(status().textContent).toBe("Couldn't copy")
  })

  it("hands the error to onCopyError and not to onCopy", async () => {
    const failure = new Error("denied")
    stubClipboard(vi.fn().mockRejectedValue(failure))
    const onCopy = vi.fn()
    const onCopyError = vi.fn()
    render(<CopyButton value="x" onCopy={onCopy} onCopyError={onCopyError} />)

    await click("Copy")

    expect(onCopyError).toHaveBeenCalledExactlyOnceWith(failure)
    expect(onCopy).not.toHaveBeenCalled()
  })

  it("goes back to idle after the reset time and can be tried again", async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyButton value="x" />)
    const button = screen.getByRole("button", { name: "Copy" })

    await click("Copy")
    expect(button.getAttribute("data-state")).toBe("failed")
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(button.getAttribute("data-state")).toBe("idle")

    await click("Copy")
    expect(button.getAttribute("data-state")).toBe("copied")
  })
})

describe("CopyButton labels", () => {
  it("uses children as the visible label, and swaps them for the result", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton value="x">Copy</CopyButton>)
    expect(screen.getByRole("button", { name: "Copy" }).getAttribute("aria-label")).toBeNull()

    await click("Copy")

    expect(screen.getByRole("button", { name: "Copied" })).not.toBeNull()
    expect(status().textContent).toBe("Copied")
  })

  it("takes the app's own words for the name and the two results", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")))
    render(<CopyButton value="x" label="Copy full SHA 9f8e7d6" failedLabel="SHA not copied" />)

    await click("Copy full SHA 9f8e7d6")

    expect(status().textContent).toBe("SHA not copied")
  })

  it("keeps the idle name and drops the icon from the accessibility tree", () => {
    render(<CopyButton value="x" />)
    expect(screen.getByRole("button", { name: "Copy" }).querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("CopyButton as a Button", () => {
  it("is a button slot, so the coarse-pointer 44px floor applies", () => {
    render(<CopyButton value="x" />)
    expect(screen.getByRole("button", { name: "Copy" }).getAttribute("data-slot")).toBe("button")
  })

  it("is type=button, so it never submits a form", () => {
    render(
      <form onSubmit={(event) => event.preventDefault()}>
        <CopyButton value="x" />
      </form>
    )
    expect(screen.getByRole("button", { name: "Copy" }).getAttribute("type")).toBe("button")
  })

  it("passes className, variant and other props through", () => {
    render(<CopyButton value="x" variant="outline" className="extra" data-testid="copy" />)
    const button = screen.getByTestId("copy")
    expect(button.className).toContain("extra")
    expect(button.className).toContain("border-border")
  })

  it("still calls the consumer's onClick, and skips the copy when it prevents the default", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault())
    render(<CopyButton value="x" onClick={onClick} />)

    await click("Copy")

    expect(onClick).toHaveBeenCalledOnce()
    expect(writeText).not.toHaveBeenCalled()
  })

  it("does nothing while disabled", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyButton value="x" disabled />)

    fireEvent.click(screen.getByRole("button", { name: "Copy" }))

    expect(writeText).not.toHaveBeenCalled()
  })

  it("clears its timer on unmount", async () => {
    vi.useFakeTimers()
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    const { unmount } = render(<CopyButton value="x" />)

    await click("Copy")
    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
