import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatRelativeTime, useNow } from "../registry/lib/relative-time"

// relative-time (frontend#217): one formatter ("5m ago", "in 2h") and one clock-tick hook, replacing the
// copies in watchtower, ops-hub, knowledge and budget. The formatter is pure and takes `now`, so every
// boundary here is exact: seconds, minutes, hours, days, and times in the future.

const NOW = Date.parse("2026-11-26T00:00:00.000Z")
const ago = (seconds: number) => NOW - seconds * 1000
const ahead = (seconds: number) => NOW + seconds * 1000

describe("formatRelativeTime: the past", () => {
  it.each([
    [0, "just now"],
    [4, "just now"],
    [5, "5s ago"],
    [59, "59s ago"],
    [60, "1m ago"],
    [119, "1m ago"],
    [120, "2m ago"],
    [3599, "59m ago"],
    [3600, "1h ago"],
    [7199, "1h ago"],
    [86_399, "23h ago"],
    [86_400, "1d ago"],
    [172_799, "1d ago"],
    [172_800, "2d ago"],
    [86_400 * 400, "400d ago"],
  ])("%d seconds back reads %s", (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), NOW)).toBe(expected)
  })
})

describe("formatRelativeTime: the future", () => {
  it.each([
    [1, "just now"],
    [4, "just now"],
    [5, "in 5s"],
    [59, "in 59s"],
    [60, "in 1m"],
    [3599, "in 59m"],
    [3600, "in 1h"],
    [7200, "in 2h"],
    [86_399, "in 23h"],
    [86_400, "in 1d"],
    [86_400 * 3, "in 3d"],
  ])("%d seconds ahead reads %s", (seconds, expected) => {
    expect(formatRelativeTime(ahead(seconds), NOW)).toBe(expected)
  })
})

describe("formatRelativeTime: inputs", () => {
  it("takes an ISO string, an epoch in milliseconds or a Date", () => {
    const fiveMinutesBack = ago(300)
    expect(formatRelativeTime(new Date(fiveMinutesBack).toISOString(), NOW)).toBe("5m ago")
    expect(formatRelativeTime(fiveMinutesBack, NOW)).toBe("5m ago")
    expect(formatRelativeTime(new Date(fiveMinutesBack), NOW)).toBe("5m ago")
  })

  it("returns the fallback, empty by default, for null, undefined and an unparseable value", () => {
    expect(formatRelativeTime(null, NOW)).toBe("")
    expect(formatRelativeTime(undefined, NOW)).toBe("")
    expect(formatRelativeTime("not a date", NOW)).toBe("")
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("")
    expect(formatRelativeTime(null, NOW, "never")).toBe("never")
    expect(formatRelativeTime("not a date", NOW, "unknown")).toBe("unknown")
  })

  it("rounds the magnitude down on both sides of now", () => {
    expect(formatRelativeTime(NOW - 5999, NOW)).toBe("5s ago")
    expect(formatRelativeTime(NOW + 5999, NOW)).toBe("in 5s")
    expect(formatRelativeTime(NOW + 119_999, NOW)).toBe("in 1m")
  })

  it("reads the current time when `now` is left out", () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    try {
      expect(formatRelativeTime(ago(7200))).toBe("2h ago")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts at the current time and ticks on the interval", () => {
    const { result } = renderHook(() => useNow(1000))
    expect(result.current).toBe(NOW)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(NOW + 1000)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toBe(NOW + 3000)
  })

  it("ticks every 30 seconds by default, so a minute label stays fresh", () => {
    const { result } = renderHook(() => useNow())
    act(() => {
      vi.advanceTimersByTime(29_999)
    })
    expect(result.current).toBe(NOW)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(NOW + 30_000)
  })

  it("keeps a relative label current as time passes", () => {
    const then = ago(30)
    const { result } = renderHook(() => formatRelativeTime(then, useNow(1000)))
    expect(result.current).toBe("30s ago")
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(result.current).toBe("1m ago")
  })

  it("stops its timer on unmount", () => {
    const { unmount } = renderHook(() => useNow(1000))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("restarts the timer when the interval changes", () => {
    const { result, rerender } = renderHook(({ every }) => useNow(every), { initialProps: { every: 1000 } })
    rerender({ every: 5000 })
    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(result.current).toBe(NOW)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(NOW + 5000)
  })
})
