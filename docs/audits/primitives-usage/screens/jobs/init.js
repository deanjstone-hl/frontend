localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "local-fixture-token", token_type: "bearer", expires_in: 360000, expires_at: 4102444800, refresh_token: "local-fixture-refresh", user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: { name: "Owner" }, created_at: "2026-01-01T00:00:00Z" } }))

// The app drops roles whose closing date has passed, so the fixture's roles only show on the day it was written for. Pin the page's clock to the mocks' "asOf" date (new Date() and Date.now() only; a timestamp given to Date is left alone).
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
