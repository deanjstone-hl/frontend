"use client"

import {
  Slider as SliderRoot,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider"
import type * as React from "react"

import { cn } from "cn"

type SliderProps = React.ComponentProps<typeof SliderRoot> & {
  /** One accessible name per thumb. A range needs them; a single slider falls back to the root's `aria-label`. */
  thumbLabels?: string[]
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabels,
  ...props
}: SliderProps) {
  const current = value ?? defaultValue
  const thumbCount = typeof current === "number" ? 1 : Array.isArray(current) ? current.length : 2

  return (
    <SliderRoot
      className={cn("data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full", className)}
      defaultValue={defaultValue ?? (value === undefined ? [min, max] : undefined)}
      value={value}
      min={min}
      max={max}
      {...props}
    >
      <SliderControl className="relative flex w-full touch-none items-center px-1.5 select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-[orientation=vertical]:px-0 data-[orientation=vertical]:py-1.5">
        <SliderTrack className="relative grow rounded-full bg-muted select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1">
          <SliderIndicator
            render={<div data-slot="slider-range" />}
            className="rounded-full bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
          {Array.from({ length: thumbCount }, (_, index) => (
            <SliderThumb
              key={index}
              index={index}
              aria-label={thumbLabels?.[index] ?? props["aria-label"]}
              aria-labelledby={props["aria-labelledby"]}
              className="block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 has-[:focus-visible]:ring-3 data-dragging:ring-3 data-disabled:pointer-events-none data-disabled:opacity-50"
            />
          ))}
        </SliderTrack>
      </SliderControl>
    </SliderRoot>
  )
}

export { Slider }
