// Relative time: one formatter ("5m ago", "in 2h") and one clock-tick hook. The apps each kept their own copy
// of the formatter (watchtower, ops-hub, knowledge, budget); this is the single one. The formatter is pure and
// takes `now`, so a server, a test or any framework can use it. The hook is what makes a label on screen
// stay true while the page sits open.

import { useEffect, useState } from "react"

const SECOND = 1000
const MINUTE = 60
const HOUR = 3600
const DAY = 86_400

/** Closer than this to now, either side, reads "just now". It also absorbs a few seconds of clock skew. */
const JUST_NOW_SECONDS = 5

/** How often `useNow` ticks when no interval is given: often enough that a minute label is never stale. */
const DEFAULT_TICK_MS = 30_000

/**
 * How long ago, or how far ahead, a moment is: `just now`, `5s ago`, `5m ago`, `3h ago`, `2d ago`, and `in 5s`,
 * `in 2h`, `in 3d` for the future. One unit, rounded down, so "5m ago" means five minutes and some seconds,
 * never six. There is nothing past days: 400 days reads `400d ago`, and a screen that wants a date there
 * should switch to one.
 *
 * `now` defaults to the clock; pass the value from `useNow` to keep the label current, or a fixed one in a test.
 * A missing or unparseable value returns `fallback` (empty by default), so a row with no timestamp can say
 * `never` without a branch of its own.
 */
export function formatRelativeTime(value: string | number | Date | null | undefined, now: number = Date.now(), fallback = ""): string {
  if (value === null || value === undefined) return fallback
  const then = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
  if (Number.isNaN(then)) return fallback

  const difference = Math.trunc((now - then) / SECOND)
  const seconds = Math.abs(difference)
  if (seconds < JUST_NOW_SECONDS) return "just now"

  const span = seconds < MINUTE ? `${seconds}s` : seconds < HOUR ? `${Math.floor(seconds / MINUTE)}m` : seconds < DAY ? `${Math.floor(seconds / HOUR)}h` : `${Math.floor(seconds / DAY)}d`
  return difference < 0 ? `in ${span}` : `${span} ago`
}

/**
 * The current time in epoch milliseconds, refreshed every `intervalMs` (default 30 s): `const now = useNow()`,
 * then `formatRelativeTime(item.updatedAt, now)`. Every component that calls it runs its own timer, so call it
 * once in a list's parent and pass `now` down. The timer stops on unmount.
 */
export function useNow(intervalMs: number = DEFAULT_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}
