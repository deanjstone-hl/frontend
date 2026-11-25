import * as React from "react"
import { WifiOffIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useOnline } from "@/hooks/use-online"

type OfflineBannerProps = Omit<React.ComponentProps<typeof Alert>, "variant" | "title" | "children"> & {
  /** What being offline means for this app, one short line: "Offline", "Offline — reading from cache". */
  title?: React.ReactNode
  /** The detail under the title: what still works, or what happens on reconnect. */
  description?: React.ReactNode
}

// A warning alert shown only while the browser is offline, and nothing at all online. A status, not an
// alert, so a screen reader reads it politely instead of interrupting. The place it sits (top of the page,
// above a list) is the caller's: the banner is a block, not a fixed strip.
function OfflineBanner({ title = "You're offline", description, icon, ...props }: OfflineBannerProps) {
  const online = useOnline()
  if (online) return null

  return (
    <Alert
      variant="warning"
      role="status"
      aria-live="polite"
      icon={icon === undefined ? <WifiOffIcon aria-hidden="true" /> : icon}
      {...props}
    >
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  )
}

export { OfflineBanner }
