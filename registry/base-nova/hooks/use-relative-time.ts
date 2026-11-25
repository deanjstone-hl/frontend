"use client"

import * as React from "react"

import { formatRelativeTime, msUntilRelativeTimeChanges, type RelativeTimeInput } from "@/lib/relative-time"

// The text "5m ago" or "in 2h" for a time, kept current. One timer per call, set for the exact instant the
// text next changes, so a time that reads in minutes renders once a minute, not once a second. Returning
// to a tab that slept renders at once. The first render reads the clock, so a server-rendered page can
// differ from the browser's first render by a unit: use it in client-rendered apps, or pass the server's
// text through until after mount.
export function useRelativeTime(value: RelativeTimeInput): string {
  const [, refresh] = React.useReducer((count: number) => count + 1, 0)
  const key = value instanceof Date ? value.getTime() : value

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(timer)
      const delay = msUntilRelativeTimeChanges(key)
      if (delay === null) return
      timer = setTimeout(() => {
        refresh()
        arm()
      }, delay)
    }
    const onVisible = () => {
      if (document.visibilityState === "hidden") return
      refresh()
      arm()
    }
    arm()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [key])

  return formatRelativeTime(key)
}
