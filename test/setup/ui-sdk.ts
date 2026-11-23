// jsdom has no top layer and no animations, which the @ui-sdk popups need to render. These are the
// stubs the SDK's testing guide gives (frontend#245). They do not exercise native popup behaviour:
// the geometry gate checks that in a real browser. The SDK's development warnings fail the test.
//
// A test file that renders an SDK popup calls installUiSdkStubs() once at its top. It is not a
// global setup file because the getAnimations stub changes how the Base UI items that have not
// moved yet (the drawer, the toggle-group) close.
declare global {
  var __UI_SDK_STRICT__: boolean | undefined
}

export const installUiSdkStubs = () => {
  globalThis.__UI_SDK_STRICT__ = true
  HTMLElement.prototype.showPopover ??= function () {}
  HTMLElement.prototype.hidePopover ??= function () {}
  Element.prototype.getAnimations ??= () => []
  // A menu or a select scrolls the highlighted item into view; jsdom has no layout to scroll.
  Element.prototype.scrollIntoView ??= function () {}
  document.head.append(
    Object.assign(document.createElement("style"), { textContent: "[popover] { display: block !important }" }),
  )
}
