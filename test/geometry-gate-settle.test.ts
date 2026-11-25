// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest"
import { settle } from "../scripts/geometry-gate/collect.mjs"

// The gate waits for a page to stop moving before it measures it. A scroll-linked animation (the
// @ui-sdk drawer under its scroll-snap driver moves its sheet and backdrop on ScrollTimelines,
// frontend#248) is driven by a scroll position, not by the clock, so its `finished` promise never
// resolves while the sheet rests, and waiting for it hung the gate.

const timeline = { kind: "document" }
const scrollTimeline = { kind: "scroll" }

const animation = (onTimeline: object, finished: Promise<unknown>) => ({
  timeline: onTimeline,
  finished,
  effect: { getComputedTiming: () => ({ iterations: 1 }) },
})

const stubPage = (animations: ReturnType<typeof animation>[]) => {
  vi.stubGlobal("document", {
    fonts: { ready: Promise.resolve() },
    timeline,
    getAnimations: () => animations,
    body: { querySelectorAll: () => [] },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe("settle", () => {
  it("returns for a page whose only finite animation is scroll-linked and never finishes", async () => {
    stubPage([animation(scrollTimeline, new Promise(() => {}))])

    const outcome = await Promise.race([
      settle().then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 3000)),
    ])

    expect(outcome).toBe("settled")
  })

  it("still waits for a clock-driven animation to finish", async () => {
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    stubPage([animation(timeline, finished)])
    let settled = false

    const run = settle().then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(settled).toBe(false)

    finish()
    await run
    expect(settled).toBe(true)
  })
})
