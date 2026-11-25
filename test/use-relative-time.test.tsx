import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useRelativeTime } from "../registry/base-nova/hooks/use-relative-time"

const START = Date.parse("2026-11-26T00:00:00.000Z")
const SECOND = 1000
const MINUTE = 60 * SECOND

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useRelativeTime", () => {
  it("returns the formatted text on the first render", () => {
    const { result } = renderHook(() => useRelativeTime(START - 5 * MINUTE))

    expect(result.current).toBe("5m ago")
  })

  it("moves on to the next text when the minute turns, without a render in between", () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useRelativeTime(START - 5 * MINUTE)
    })
    const rendersAtStart = renders

    act(() => vi.advanceTimersByTime(MINUTE - 1))
    expect(result.current).toBe("5m ago")
    expect(renders).toBe(rendersAtStart)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe("6m ago")
    expect(renders).toBe(rendersAtStart + 1)
  })

  it("counts seconds one at a time while the text is in seconds", () => {
    const { result } = renderHook(() => useRelativeTime(START - 10 * SECOND))

    expect(result.current).toBe("10s ago")
    act(() => vi.advanceTimersByTime(SECOND))
    expect(result.current).toBe("11s ago")
  })

  it("counts a future time down and then past it", () => {
    const { result } = renderHook(() => useRelativeTime(START + 2 * MINUTE + 30 * SECOND))

    expect(result.current).toBe("in 2m")
    act(() => vi.advanceTimersByTime(30 * SECOND + 1))
    expect(result.current).toBe("in 1m")
    act(() => vi.advanceTimersByTime(60 * SECOND))
    expect(result.current).toBe("in 59s")
    act(() => vi.advanceTimersByTime(60 * SECOND))
    expect(result.current).toBe("just now")
    act(() => vi.advanceTimersByTime(5 * SECOND))
    expect(result.current).toBe("5s ago")
  })

  it("follows a new time passed in", () => {
    const { result, rerender } = renderHook(({ at }) => useRelativeTime(at), { initialProps: { at: START - 5 * MINUTE } })

    rerender({ at: START - 2 * 60 * MINUTE })

    expect(result.current).toBe("2h ago")
  })

  it("reads never for a missing time and sets no timer", () => {
    const { result } = renderHook(() => useRelativeTime(null))

    expect(result.current).toBe("never")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears its timer on unmount", () => {
    const { unmount } = renderHook(() => useRelativeTime(START - 5 * MINUTE))
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it("catches up when the tab becomes visible again after a long sleep", () => {
    const { result } = renderHook(() => useRelativeTime(START))
    expect(result.current).toBe("just now")

    vi.setSystemTime(START + 3 * 60 * MINUTE)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })

    expect(result.current).toBe("3h ago")
  })
})
