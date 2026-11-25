import * as React from "react"

// The browser fires `online` and `offline` on window, and navigator.onLine is the value they announce.
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

const getSnapshot = () => navigator.onLine

// Nothing is known on the server, and a hydrating page must match it, so it reads as online.
const getServerSnapshot = () => true

/**
 * Whether the browser reports a network connection: `const online = useOnline()`. It follows the window's
 * `online` and `offline` events and stops listening on unmount. `navigator.onLine` is only a hint: `true` means
 * a network interface is up, not that your server answers.
 */
export function useOnline(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
