"use client"

import {
  Collapsible as CollapsibleRoot,
  CollapsiblePanel,
  CollapsibleTrigger as CollapsibleTriggerPrimitive,
} from "@ui-sdk/react/collapsible"
import type * as React from "react"

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsibleRoot>) {
  return <CollapsibleRoot {...props} />
}

function CollapsibleTrigger({ ...props }: React.ComponentProps<typeof CollapsibleTriggerPrimitive>) {
  return <CollapsibleTriggerPrimitive {...props} />
}

function CollapsibleContent({ ...props }: React.ComponentProps<typeof CollapsiblePanel>) {
  return <CollapsiblePanel {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
