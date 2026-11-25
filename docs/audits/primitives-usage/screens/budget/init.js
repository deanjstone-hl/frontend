// The app keeps its Supabase session in a cookie (@supabase/ssr), not localStorage. The build sets VITE_COOKIE_DOMAIN to an empty string, so the cookie is host-only and the client reads this one. The key is "sb-" plus the first label of the Supabase URL's host (127.0.0.1 gives "127").
const session = { access_token: "local-fixture-token", token_type: "bearer", expires_in: 360000, expires_at: 4102444800, refresh_token: "local-fixture-refresh", user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: { name: "Owner" }, created_at: "2026-01-01T00:00:00Z" } }
const base64url = btoa(JSON.stringify(session)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
document.cookie = `sb-127-auth-token=base64-${base64url}; path=/`

// Pin the page's clock to the mocks' date: the budget screens read this month's transactions and the current budget period. Only new Date() and Date.now() move; a timestamp given to Date is left alone.
const fixedNow = Date.parse("2026-11-10T02:00:00Z")
const RealDate = Date
class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fixedNow)
    else super(...args)
  }
  static now() {
    return fixedNow
  }
}
window.Date = FixedDate
