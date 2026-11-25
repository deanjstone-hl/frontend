// "5m ago", "in 2h": one formatter for the time since, or until, an instant, and the delay until that text
// next changes. Pure TypeScript with no React and no clock of its own beyond the `now` default, so a
// server, a test or any framework can use it. The hook that re-renders on that delay is `use-relative-time`.
//
// The units are seconds, minutes, hours and days, each counted in whole units and cut off, never rounded:
// "5m ago" holds until the sixth minute starts. There is no week or month unit, so a long gap reads
// "45d ago"; show the date beside the text when the gap is long enough that a date is what you want.

/** What the formatter reads: a `Date`, epoch milliseconds or a date string. Nothing, or an unreadable value, reads as "never". */
export type RelativeTimeInput = Date | number | string | null | undefined

/** What the text says for a missing or unreadable time. */
export const NEVER_TEXT = "never"

/** What the text says within `JUST_NOW_MS` of the present, either side, so clock skew never reads "in 0s". */
export const JUST_NOW_TEXT = "just now"

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Under this gap, before or after now, the text is "just now". */
export const JUST_NOW_MS = 5 * SECOND

const toEpoch = (value: RelativeTimeInput): number | null => {
  if (value == null || value === "") return null
  const epoch = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
  return Number.isFinite(epoch) ? epoch : null
}

const unitFor = (gap: number): { label: string; size: number } => {
  if (gap < MINUTE) return { label: "s", size: SECOND }
  if (gap < HOUR) return { label: "m", size: MINUTE }
  if (gap < DAY) return { label: "h", size: HOUR }
  return { label: "d", size: DAY }
}

/** The text for the gap between `value` and `now` (default the clock): "just now", "5s ago", "3h ago", "in 2h", "in 1d", or "never". */
export function formatRelativeTime(value: RelativeTimeInput, now: number = Date.now()): string {
  const epoch = toEpoch(value)
  if (epoch === null) return NEVER_TEXT
  const difference = epoch - now
  const gap = Math.abs(difference)
  if (gap < JUST_NOW_MS) return JUST_NOW_TEXT
  const { label, size } = unitFor(gap)
  const count = Math.floor(gap / size)
  return difference < 0 ? `${count}${label} ago` : `in ${count}${label}`
}

/**
 * Milliseconds from `now` (default the clock) until `formatRelativeTime` would return different text for
 * `value`: the exact instant, so a timer set for it renders once per change and never early or late.
 * `null` when the text can never change (a missing or unreadable time).
 */
export function msUntilRelativeTimeChanges(value: RelativeTimeInput, now: number = Date.now()): number | null {
  const epoch = toEpoch(value)
  if (epoch === null) return null
  const difference = epoch - now
  const gap = Math.abs(difference)
  const { size } = unitFor(gap)
  if (difference <= 0) {
    // Counting up: the text changes when the next whole unit has passed.
    return gap < JUST_NOW_MS ? JUST_NOW_MS - gap : (Math.floor(gap / size) + 1) * size - gap
  }
  // Counting down: the text changes when the time left drops below the whole unit it now shows.
  return gap < JUST_NOW_MS ? gap + JUST_NOW_MS : gap - Math.floor(gap / size) * size + 1
}
