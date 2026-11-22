// jsdom has no top layer and no animations, which the @ui-sdk popups need to render. These are the
// stubs the SDK's testing guide gives (frontend#245). They do not exercise native popup behaviour:
// the geometry gate checks that in a real browser. The SDK's development warnings fail the test.
declare global {
  var __UI_SDK_STRICT__: boolean | undefined
}
globalThis.__UI_SDK_STRICT__ = true

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.showPopover ??= function () {}
  HTMLElement.prototype.hidePopover ??= function () {}
  Element.prototype.getAnimations ??= () => []
  document.head.append(
    Object.assign(document.createElement("style"), { textContent: "[popover] { display: block !important }" }),
  )
}
