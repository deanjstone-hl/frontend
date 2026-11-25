import * as React from "react"
import { ArrowDown, ArrowUp, Minus } from "lucide-react"

import { cn } from "cn"

type Trend = "up" | "down" | "flat"

const TRENDS = {
  up: { Icon: ArrowUp, word: "Up" },
  down: { Icon: ArrowDown, word: "Down" },
  flat: { Icon: Minus, word: "No change" },
} as const

const DELTA_TONES = {
  neutral: "text-muted-foreground",
  success: "text-success",
  critical: "text-critical",
} as const

type StatTileProps = Omit<React.ComponentProps<"dl">, "children"> & {
  /** What the number counts. One short line, set small and muted above the number. */
  label: React.ReactNode
  /** The number, already formatted ("$1,204", "12", "98%"). Set in tabular figures. */
  value: React.ReactNode
  /** The number's unit ("km", "AUD"), set smaller and muted beside it. */
  unit?: React.ReactNode
  /** The change since last time, already formatted ("+2.1%"). Drawn under the number. */
  delta?: React.ReactNode
  /** Which way the delta moved. Adds an arrow and a word for a screen reader, so the change never rests on colour alone. */
  trend?: Trend
  /** Colour of the delta, from the status tokens: whether the change is good or bad news is the caller's call (more spend is up, and bad). */
  tone?: keyof typeof DELTA_TONES
  /**
   * `lead` makes this the number the screen is about: 30px against the default 21px. Give it to one tile.
   * A screen of equal tiles has no largest text (the one-largest rule: at most two elements at the top
   * size, at least 1.2 times the next one down).
   */
  size?: "default" | "lead"
  /** `plain` drops the card surface, for a tile that already sits inside a card. */
  variant?: "tile" | "plain"
}

// A label over one big number, with an optional unit and delta. A description list of one: a screen
// reader reads "label, value", and a grid of tiles is the caller's layout.
function StatTile({
  label,
  value,
  unit,
  delta,
  trend,
  tone = "neutral",
  size = "default",
  variant = "tile",
  className,
  ...props
}: StatTileProps) {
  const arrow = trend ? TRENDS[trend] : null

  return (
    <dl
      data-slot="stat-tile"
      data-size={size}
      className={cn(
        "flex min-w-0 flex-col gap-1",
        variant === "tile" && "rounded-xl bg-card p-3 text-card-foreground ring-1 ring-foreground/10",
        className
      )}
      {...props}
    >
      <dt data-slot="stat-tile-label" className="text-xs font-medium text-muted-foreground wrap-anywhere">
        {label}
      </dt>
      <dd
        data-slot="stat-tile-value"
        className={cn(
          "font-heading leading-none font-semibold tabular-nums wrap-anywhere",
          size === "lead" ? "text-3xl" : "text-xl"
        )}
      >
        {value}
        {unit ? (
          <span
            data-slot="stat-tile-unit"
            className={cn("ml-1 font-normal text-muted-foreground", size === "lead" ? "text-base" : "text-sm")}
          >
            {unit}
          </span>
        ) : null}
      </dd>
      {delta ? (
        <dd
          data-slot="stat-tile-delta"
          className={cn("flex items-center gap-1 text-xs font-medium tabular-nums wrap-anywhere", DELTA_TONES[tone])}
        >
          {arrow ? (
            <>
              <arrow.Icon aria-hidden="true" className="size-3 shrink-0" />
              <span className="sr-only">{arrow.word} </span>
            </>
          ) : null}
          {delta}
        </dd>
      ) : null}
    </dl>
  )
}

export { StatTile }
export type { StatTileProps }
