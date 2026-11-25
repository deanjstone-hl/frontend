// @vitest-environment node

import { describe, expect, it } from "vitest"

import { formatRelativeTime, msUntilRelativeTimeChanges } from "../registry/lib/relative-time"

const NOW = Date.parse("2026-11-26T00:00:00.000Z")
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ago = (ms: number) => formatRelativeTime(NOW - ms, NOW)
const ahead = (ms: number) => formatRelativeTime(NOW + ms, NOW)

describe("formatRelativeTime, past times", () => {
  it("says just now under five seconds, including the exact present", () => {
    expect(ago(0)).toBe("just now")
    expect(ago(4999)).toBe("just now")
  })

  it("counts seconds from five up to a minute", () => {
    expect(ago(5 * SECOND)).toBe("5s ago")
    expect(ago(59 * SECOND)).toBe("59s ago")
    expect(ago(59 * SECOND + 999)).toBe("59s ago")
  })

  it("counts whole minutes from a minute up to an hour", () => {
    expect(ago(MINUTE)).toBe("1m ago")
    expect(ago(5 * MINUTE + 59 * SECOND)).toBe("5m ago")
    expect(ago(HOUR - 1)).toBe("59m ago")
  })

  it("counts whole hours from an hour up to a day", () => {
    expect(ago(HOUR)).toBe("1h ago")
    expect(ago(23 * HOUR + 59 * MINUTE)).toBe("23h ago")
    expect(ago(DAY - 1)).toBe("23h ago")
  })

  it("counts whole days from a day on, with no week or month unit", () => {
    expect(ago(DAY)).toBe("1d ago")
    expect(ago(6 * DAY)).toBe("6d ago")
    expect(ago(45 * DAY)).toBe("45d ago")
    expect(ago(400 * DAY)).toBe("400d ago")
  })
})

describe("formatRelativeTime, future times", () => {
  it("says just now under five seconds either side of the present, so clock skew never reads in 0s", () => {
    expect(ahead(1)).toBe("just now")
    expect(ahead(4999)).toBe("just now")
  })

  it("counts down in seconds, minutes, hours and days", () => {
    expect(ahead(5 * SECOND)).toBe("in 5s")
    expect(ahead(59 * SECOND + 999)).toBe("in 59s")
    expect(ahead(MINUTE)).toBe("in 1m")
    expect(ahead(2 * HOUR)).toBe("in 2h")
    expect(ahead(2 * HOUR + 59 * MINUTE)).toBe("in 2h")
    expect(ahead(DAY)).toBe("in 1d")
    expect(ahead(3 * DAY + 5 * HOUR)).toBe("in 3d")
  })
})

describe("formatRelativeTime, inputs", () => {
  it("takes a Date, epoch milliseconds or an ISO string and reads them the same", () => {
    const then = NOW - 5 * MINUTE
    expect(formatRelativeTime(new Date(then), NOW)).toBe("5m ago")
    expect(formatRelativeTime(then, NOW)).toBe("5m ago")
    expect(formatRelativeTime(new Date(then).toISOString(), NOW)).toBe("5m ago")
  })

  it("reads the present from the clock when no now is given", () => {
    expect(formatRelativeTime(Date.now() - 2 * HOUR)).toBe("2h ago")
  })

  it("says never for a missing or unreadable time", () => {
    expect(formatRelativeTime(null, NOW)).toBe("never")
    expect(formatRelativeTime(undefined, NOW)).toBe("never")
    expect(formatRelativeTime("", NOW)).toBe("never")
    expect(formatRelativeTime("not a date", NOW)).toBe("never")
    expect(formatRelativeTime(new Date("nope"), NOW)).toBe("never")
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("never")
  })
})

describe("msUntilRelativeTimeChanges", () => {
  // The delay must land on the first instant the text differs, never earlier (a wasted render) or later (stale text).
  const textAfter = (then: number, now: number) => {
    const delay = msUntilRelativeTimeChanges(then, now)
    return { delay, before: formatRelativeTime(then, now), at: formatRelativeTime(then, now + delay), justBefore: formatRelativeTime(then, now + delay - 1) }
  }

  it.each([
    ["inside just now, past", NOW - 1500],
    ["a few seconds old", NOW - 7300],
    ["a minute and a bit old", NOW - (MINUTE + 12_345)],
    ["half an hour old", NOW - (30 * MINUTE + 4000)],
    ["two hours old", NOW - (2 * HOUR + 17 * MINUTE)],
    ["three days old", NOW - (3 * DAY + 5 * HOUR)],
    ["just now, ahead", NOW + 2500],
    ["seconds ahead", NOW + 42_500],
    ["minutes ahead", NOW + (7 * MINUTE + 30 * SECOND)],
    ["an exact minute ahead", NOW + MINUTE],
    ["hours ahead", NOW + (2 * HOUR + 59 * MINUTE)],
    ["days ahead", NOW + (2 * DAY + 3 * HOUR)],
  ])("lands on the instant the text changes: %s", (_label, then) => {
    const { delay, before, at, justBefore } = textAfter(then, NOW)
    expect(delay).toBeGreaterThan(0)
    expect(justBefore).toBe(before)
    expect(at).not.toBe(before)
  })

  it("waits a minute at most while the text counts minutes, not a second at a time", () => {
    expect(msUntilRelativeTimeChanges(NOW - 5 * MINUTE, NOW)).toBe(MINUTE)
  })

  it("returns null for a missing or unreadable time, since nothing will change", () => {
    expect(msUntilRelativeTimeChanges(null, NOW)).toBeNull()
    expect(msUntilRelativeTimeChanges("not a date", NOW)).toBeNull()
  })
})
