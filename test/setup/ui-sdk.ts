// jsdom has no top layer and no animations, which the @ui-sdk popups need to render. These are the
// stubs the SDK's testing guide gives (frontend#245). They do not exercise native popup behaviour:
// the geometry gate checks that in a real browser. The SDK's development warnings fail the test.
//
// A test file that renders an SDK popup calls installUiSdkStubs() once at its top. It is not a
// global setup file because the getAnimations stub changes how the Base UI menus close, and those
// items (context-menu, dropdown-menu, menubar) have not moved yet.
declare global {
  var __UI_SDK_STRICT__: boolean | undefined
}

export const installUiSdkStubs = () => {
  globalThis.__UI_SDK_STRICT__ = true
  HTMLElement.prototype.showPopover ??= function () {}
  HTMLElement.prototype.hidePopover ??= function () {}
  Element.prototype.getAnimations ??= () => []
  document.head.append(
    Object.assign(document.createElement("style"), { textContent: "[popover] { display: block !important }" }),
  )
}
