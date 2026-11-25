// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest"
import { motion } from "../scripts/geometry-gate/page-checks.mjs"

// The reduced-motion check fails a page whose animations keep running under
// prefers-reduced-motion: reduce. A scroll-linked animation (the @ui-sdk drawer's sheet and
// backdrop, frontend#248) is driven by a scroll position the reader sets with a finger, never by
// the clock, so it cannot keep moving on its own: it is not what the check is for.

const timeline = { kind: "document" }
const scrollTimeline = { kind: "scroll" }

const animation = (onTimeline: object, iterations: number, duration: unknown) => ({
  timeline: onTimeline,
  animationName: "slide",
  constructor: { name: "Animation" },
  effect: {
    target: { dataset: { slot: "drawer-content" }, tagName: "DIV" },
    getComputedTiming: () => ({ iterations, duration }),
  },
})

const stubPage = (animations: ReturnType<typeof animation>[]) =>
  vi.stubGlobal("document", { timeline, getAnimations: () => animations })

afterEach(() => vi.unstubAllGlobals())

describe("motion", () => {
  it("ignores a scroll-linked animation, which only moves when the reader scrolls", async () => {
    stubPage([animation(scrollTimeline, 1, { value: 100, unit: "percent" })])

    expect(await motion()).toEqual([])
  })

  it("still reports a clock-driven animation that keeps running", async () => {
    stubPage([animation(timeline, Infinity, 1000)])

    const findings = await motion()

    expect(findings.map((finding: { check: string }) => finding.check)).toEqual(["reduced-motion"])
  })
})
