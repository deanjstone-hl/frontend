import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useOnline } from "../registry/base-nova/hooks/use-online"

// use-online (frontend#219): the shared `online`/`offline` listener, replacing sparky's `useOnline` and the
// listener each OfflineBanner kept. jsdom's navigator.onLine is always true, so each test sets what the
// browser would report, then fires the event the browser fires.

const setOnLine = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value)
const fire = (type: "online" | "offline") => act(() => void window.dispatchEvent(new Event(type)))

afterEach(() => vi.restoreAllMocks())

describe("useOnline", () => {
  it("starts from navigator.onLine when online", () => {
    setOnLine(true)
    expect(renderHook(() => useOnline()).result.current).toBe(true)
  })

  it("starts from navigator.onLine when offline", () => {
    setOnLine(false)
    expect(renderHook(() => useOnline()).result.current).toBe(false)
  })

  it("goes false on an offline event and true on an online event", () => {
    setOnLine(true)
    const { result } = renderHook(() => useOnline())

    setOnLine(false)
    fire("offline")
    expect(result.current).toBe(false)

    setOnLine(true)
    fire("online")
    expect(result.current).toBe(true)
  })

  it("keeps a second hook in step with the first", () => {
    setOnLine(true)
    const first = renderHook(() => useOnline())
    const second = renderHook(() => useOnline())

    setOnLine(false)
    fire("offline")
    expect(first.result.current).toBe(false)
    expect(second.result.current).toBe(false)
  })

  it("stops listening on unmount", () => {
    setOnLine(true)
    const added = vi.spyOn(window, "addEventListener")
    const removed = vi.spyOn(window, "removeEventListener")
    const { unmount } = renderHook(() => useOnline())
    const types = (calls: unknown[][]) => calls.map(([type]) => type)

    expect(types(added.mock.calls)).toEqual(expect.arrayContaining(["online", "offline"]))
    unmount()
    expect(types(removed.mock.calls)).toEqual(expect.arrayContaining(["online", "offline"]))
  })

  it("reads as online where there is no navigator to ask (server render)", async () => {
    const { renderToString } = await import("react-dom/server")
    const Probe = () => <span>{useOnline() ? "online" : "offline"}</span>
    setOnLine(false)
    expect(renderToString(<Probe />)).toContain("online")
  })
})
