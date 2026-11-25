// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { MODES, THEME_NAMES, TOKEN_MAP, contrastRatio } from "../scripts/theme/extract-t3.mjs"
import { applyToRegistry, applyToTokensCss } from "../scripts/theme/build.mjs"
import { STATUS_ROLES, STATUS_TOKENS, STATUS_WASH } from "../scripts/theme/status.mjs"

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const tokensCss = read("../theme/tokens.css")
const registry = JSON.parse(read("../registry.json"))
const themeSource = JSON.parse(read("../theme/themes.json"))
const registryTheme = registry.items.find((item: { name: string }) => item.name === "theme")
const builtItem = JSON.parse(read("../r/theme.json"))

type Rule = { selector: string; declarations: Record<string, string> }

const parseDeclarations = (body: string) =>
  Object.fromEntries(
    [...body.matchAll(/(-{0,2}[a-z][a-z0-9-]*):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  )

// Every innermost `selector { declarations }` block, selector lists split apart.
const rulesFromCss = (css: string): Rule[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{([^{}]*)\}/g)].flatMap(
    ([, selectors, body]) =>
      selectors
        .split(",")
        .map((selector) => ({ selector: selector.trim(), declarations: parseDeclarations(body) })),
  )

const rulesFromRegistry = (item: {
  cssVars: { light: Record<string, string>; dark: Record<string, string> }
  css: Record<string, Record<string, string> | string>
}): Rule[] => [
  {
    selector: ":root",
    declarations: Object.fromEntries(Object.entries(item.cssVars.light).map(([k, v]) => [`--${k}`, v])),
  },
  {
    selector: ".dark",
    declarations: Object.fromEntries(Object.entries(item.cssVars.dark).map(([k, v]) => [`--${k}`, v])),
  },
  ...Object.entries(item.css).flatMap(([selectors, body]) =>
    typeof body === "object"
      ? selectors.split(/,(?![^[]*\])/).map((selector) => ({ selector: selector.trim(), declarations: body as Record<string, string> }))
      : [],
  ),
]

// The cascade for <html data-theme=… class="dark">: a selector built only from
// :root, .dark and [data-theme="…"] matches when every part does; specificity is
// the part count; later wins on a tie.
const resolveTokens = (rules: Rule[], theme: string | null, dark: boolean) => {
  const resolved: Record<string, { value: string; specificity: number; order: number }> = {}
  rules.forEach(({ selector, declarations }, order) => {
    const parts = selector.match(/:root|\.dark|\[data-theme="[^"]+"\]/g)
    if (!parts || parts.join("") !== selector) return
    const matches = parts.every((part) => {
      if (part === ":root") return true
      if (part === ".dark") return dark
      return theme !== null && part === `[data-theme="${theme}"]`
    })
    if (!matches) return
    for (const [name, value] of Object.entries(declarations)) {
      const previous = resolved[name]
      if (!previous || parts.length >= previous.specificity) {
        resolved[name] = { value, specificity: parts.length, order }
      }
    }
  })
  return Object.fromEntries(Object.entries(resolved).map(([name, { value }]) => [name, value]))
}

// The resolver models the default cascade. The prefers-contrast: more layer only applies
// under that preference and is covered by prefers-contrast.test.ts.
const cssRules = rulesFromCss(tokensCss.replace(/@media \(prefers-contrast: more\) \{[\s\S]*?\n\}\n/, ""))
const registryRules = rulesFromRegistry(registryTheme)

describe("theme tokens", () => {
  describe.each(THEME_NAMES)("%s", (theme: string) => {
    it.each(MODES)("defines every shadcn token in %s mode", (mode: string) => {
      const resolved = resolveTokens(cssRules, theme, mode === "dark")
      for (const token of Object.keys(TOKEN_MAP)) {
        expect(resolved[`--${token}`], `--${token}`).toBe(themeSource.themes[theme][mode][token])
      }
    })

    it.each(MODES)("meets WCAG AA for text pairs in %s mode", (mode: string) => {
      const t = resolveTokens(cssRules, theme, mode === "dark")
      expect(contrastRatio(t["--foreground"], t["--background"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--primary-foreground"], t["--primary"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--card-foreground"], t["--card"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--secondary-foreground"], t["--secondary"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--muted-foreground"], t["--background"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--muted-foreground"], t["--muted"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--destructive-foreground"], t["--destructive"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--destructive"], t["--background"])).toBeGreaterThanOrEqual(4.5)
    })

    it.each(MODES)("keeps the field edge and focus ring at 3:1 in %s mode", (mode: string) => {
      const t = resolveTokens(cssRules, theme, mode === "dark")
      for (const ground of ["--background", "--card"]) {
        expect(contrastRatio(t["--input"], t[ground])).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(t["--ring"], t[ground])).toBeGreaterThanOrEqual(3)
      }
    })

    it.each(MODES)("ships the same values in registry.json in %s mode", (mode: string) => {
      expect(resolveTokens(registryRules, theme, mode === "dark")).toMatchObject(
        Object.fromEntries(
          Object.keys(TOKEN_MAP).map((token) => [`--${token}`, themeSource.themes[theme][mode][token]]),
        ),
      )
    })
  })

  it("is Ocean with no data-theme attribute, light or dark", () => {
    expect(resolveTokens(cssRules, null, false)["--primary"]).toBe(themeSource.themes.ocean.light.primary)
    expect(resolveTokens(cssRules, null, true)["--primary"]).toBe(themeSource.themes.ocean.dark.primary)
    expect(resolveTokens(registryRules, null, true)["--primary"]).toBe(themeSource.themes.ocean.dark.primary)
  })

  it("lets a theme's dark rules beat the bare .dark rule", () => {
    const grove = resolveTokens(cssRules, "grove", true)
    expect(grove["--primary"]).toBe(themeSource.themes.grove.dark.primary)
    expect(grove["--primary"]).not.toBe(themeSource.themes.ocean.dark.primary)
  })

  it("keeps the 0.625rem radius", () => {
    expect(resolveTokens(cssRules, null, false)["--radius"]).toBe("0.625rem")
    expect(registryTheme.cssVars.light.radius).toBe("0.625rem")
  })

  it("declares a color-scheme per mode so native controls follow the theme", () => {
    expect(resolveTokens(cssRules, null, false)["color-scheme"]).toBe("light")
    expect(resolveTokens(cssRules, "iris", true)["color-scheme"]).toBe("dark")
  })

  it("records the pinned T3 commit", () => {
    expect(themeSource.source.repository).toBe("pingdotgg/t3code")
    expect(themeSource.source.sha).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe("status tokens", () => {
  const roles = ["success", "warning", "unreachable", "critical"]
  const names = roles.flatMap((role) => [role, `${role}-foreground`])

  // A badge's tint: the status colour at the wash opacity over the ground.
  const hex = (color: string) => [0, 2, 4].map((i) => Number.parseInt(color.slice(1 + i, 3 + i), 16))
  const wash = (color: string, ground: string, opacity: number) =>
    `#${hex(color)
      .map((value, i) => Math.round(value * opacity + hex(ground)[i] * (1 - opacity)).toString(16).padStart(2, "0"))
      .join("")}`

  it("names the four roles, success to critical", () => {
    expect(STATUS_ROLES).toEqual(roles)
  })

  describe.each(THEME_NAMES)("%s", (theme: string) => {
    it.each(MODES)("defines every status token in %s mode, in tokens.css and registry.json", (mode: string) => {
      for (const rules of [cssRules, registryRules]) {
        const resolved = resolveTokens(rules, theme, mode === "dark")
        for (const name of names) {
          expect(resolved[`--${name}`], `--${name}`).toBe(STATUS_TOKENS[mode][name])
        }
      }
    })

    it.each(MODES)("meets WCAG AA for status text in %s mode", (mode: string) => {
      const t = resolveTokens(cssRules, theme, mode === "dark")
      for (const role of roles) {
        for (const ground of ["--background", "--card"]) {
          expect(contrastRatio(t[`--${role}`], t[ground]), `${role} on ${ground}`).toBeGreaterThanOrEqual(4.5)
          const tinted = wash(t[`--${role}`], t[ground], STATUS_WASH[mode])
          expect(contrastRatio(t[`--${role}`], tinted), `${role} on its ${ground} wash`).toBeGreaterThanOrEqual(4.5)
        }
        expect(contrastRatio(t[`--${role}-foreground`], t[`--${role}`]), `${role}-foreground`).toBeGreaterThanOrEqual(4.5)
      }
    })
  })

  it("maps each token to a Tailwind colour utility in tokens.css and the registry", () => {
    const declared = parseDeclarations(tokensCss.match(/@theme inline \{([^}]*)\}/)![1])
    for (const name of names) {
      expect(declared[`--color-${name}`]).toBe(`var(--${name})`)
      expect(registryTheme.cssVars.theme[`color-${name}`]).toBe(`var(--${name})`)
    }
  })

  it("keeps the orange tier between warning and critical", () => {
    const hue = (color: string) => {
      const [r, g, b] = hex(color).map((v) => v / 255)
      const max = Math.max(r, g, b)
      const delta = max - Math.min(r, g, b)
      const degrees = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
      const wrapped = (degrees * 60 + 360) % 360
      return wrapped > 180 ? wrapped - 360 : wrapped
    }
    for (const mode of MODES) {
      const t = STATUS_TOKENS[mode]
      expect(hue(t.warning)).toBeGreaterThan(hue(t.unreachable))
      expect(hue(t.unreachable)).toBeGreaterThan(hue(t.critical) + 15)
    }
  })
})

describe("type scale", () => {
  // T3 apps/mobile/global.css, px -> rem at the 16px root.
  const scale = {
    "3xs": [11, 14],
    "2xs": [12, 16],
    xs: [13, 17],
    sm: [14, 19],
    base: [16, 23],
    lg: [18, 23],
    xl: [21, 28],
    "2xl": [26, 32],
    "3xl": [30, 36],
  }
  const toPx = (rem: string) => Number.parseFloat(rem) * 16

  it.each(Object.entries(scale))("text-%s is %s px / line height", (name, [size, lineHeight]) => {
    const declared = parseDeclarations(tokensCss.match(/@theme inline \{([^}]*)\}/)![1])
    expect(toPx(declared[`--text-${name}`])).toBeCloseTo(size as number, 5)
    expect(toPx(declared[`--text-${name}--line-height`])).toBeCloseTo(lineHeight as number, 5)
    expect(toPx(registryTheme.cssVars.theme[`text-${name}`])).toBeCloseTo(size as number, 5)
    expect(toPx(registryTheme.cssVars.theme[`text-${name}--line-height`])).toBeCloseTo(lineHeight as number, 5)
  })

  it("keeps IBM Plex Sans", () => {
    expect(resolveTokens(cssRules, null, false)["--font-sans-stack"]).toMatch(/^"IBM Plex Sans Variable"/)
  })
})

describe("glass tokens", () => {
  it.each(THEME_NAMES.flatMap((theme: string) => MODES.map((mode: string) => [theme, mode])))(
    "%s %s: translucent surface over an opaque fallback",
    (theme: string, mode: string) => {
      const t = resolveTokens(cssRules, theme, mode === "dark")
      expect(t["--glass-surface"]).toMatch(/^rgba\(.*,\s*0\.\d+\)$/)
      expect(t["--glass-fallback"]).toMatch(/^#[0-9a-f]{6}$/)
      expect(t["--glass-blur"]).toBeDefined()
    },
  )

  it("surface-glass blurs the translucent surface and falls back to the opaque one", () => {
    const utility = tokensCss.match(/@utility surface-glass \{[\s\S]*?\n\}/)![0]
    expect(utility).toContain("background: var(--glass-surface)")
    expect(utility).toContain("backdrop-filter: blur(var(--glass-blur))")
    expect(utility).toMatch(/@supports not[\s\S]*background: var\(--glass-fallback\) !important/)
    const shipped = JSON.stringify(registryTheme.css["@utility surface-glass"])
    expect(shipped).toContain("var(--glass-surface)")
    expect(shipped).toContain("var(--glass-fallback) !important")
  })
})

describe("generated outputs", () => {
  it("tokens.css is what scripts/theme/build.mjs writes from theme/themes.json", () => {
    expect(applyToTokensCss(tokensCss, themeSource.themes)).toBe(tokensCss)
  })

  it("registry.json's theme item is what scripts/theme/build.mjs writes", () => {
    expect(applyToRegistry(registry, themeSource.themes)).toEqual(registry)
  })

  it("r/theme.json matches the registry item", () => {
    expect(builtItem.cssVars).toEqual(registryTheme.cssVars)
    expect(builtItem.css).toEqual(registryTheme.css)
  })
})

describe("tinted washes", () => {
  const ui = (name: string) => read(`../registry/base-nova/ui/${name}.tsx`)
  const hex = (color: string) => [0, 2, 4].map((i) => Number.parseInt(color.slice(1 + i, 3 + i), 16))
  const wash = (color: string, ground: string, opacity: number) =>
    `#${hex(color)
      .map((value, i) => Math.round(value * opacity + hex(ground)[i] * (1 - opacity)).toString(16).padStart(2, "0"))
      .join("")}`
  const grounds = ["--background", "--card", "--popover"]

  // Every dark-mode `bg-destructive/NN` wash a source file sets, whatever variants sit between
  // `dark:` and the utility (hover, a child selector). Destructive text sits on each of them.
  const darkDestructiveWashes = (file: string) =>
    [...ui(file).matchAll(/dark:[^\s"`]*\bbg-destructive\/(\d+)/g)].map(([cls, step]) => ({
      cls,
      opacity: Number(step) / 100,
    }))

  const washedFiles = ["button", "badge", "bubble", "dropdown-menu", "context-menu", "menubar"]

  it("finds the dark destructive washes it is meant to hold", () => {
    expect(darkDestructiveWashes("button").length).toBeGreaterThanOrEqual(2)
    expect(darkDestructiveWashes("badge").length).toBeGreaterThanOrEqual(1)
  })

  describe.each(THEME_NAMES)("%s", (theme: string) => {
    it("holds destructive text on every dark destructive wash at 4.5:1", () => {
      const t = resolveTokens(cssRules, theme, true)
      for (const file of washedFiles) {
        for (const { cls, opacity } of darkDestructiveWashes(file)) {
          for (const ground of grounds) {
            const ratio = contrastRatio(t["--destructive"], wash(t["--destructive"], t[ground], opacity))
            expect(ratio, `${file}: ${cls} on ${ground}`).toBeGreaterThanOrEqual(4.5)
          }
        }
      }
    })
  })

  describe("alert status variants", () => {
    const source = ui("alert")
    const variantClasses = (role: string) => {
      const match = source.match(new RegExp(`\\b${role}:\\s*"([^"]+)"`))
      expect(match, `alert has a ${role} variant`).not.toBeNull()
      return match![1]
    }
    const step = (classes: string, prefix: string, role: string) => {
      const match = classes.match(new RegExp(`(?:^|\\s)${prefix}bg-${role}/(\\d+)(?=\\s|$)`))
      expect(match, `${prefix}bg-${role}/NN`).not.toBeNull()
      return Number(match![1]) / 100
    }

    it.each(["success", "warning", "critical"])("%s reads its status token as text, with no opacity on it", (role) => {
      const classes = variantClasses(role)
      expect(classes).toMatch(new RegExp(`(?:^|\\s)text-${role}(?=\\s|$)`))
      expect(classes).toMatch(new RegExp(`data-\\[slot=alert-description\\]:text-${role}(?=\\s|$)`))
      expect(classes).not.toMatch(new RegExp(`text-${role}/`))
    })

    it.each(["success", "warning", "critical"])("%s uses the badge's wash steps", (role) => {
      const classes = variantClasses(role)
      expect(step(classes, "", role)).toBe(STATUS_WASH.light)
      expect(step(classes, "dark:", role)).toBe(STATUS_WASH.dark)
    })

    describe.each(THEME_NAMES)("%s", (theme: string) => {
      it.each(MODES)("holds each status as alert text, title and description, on its wash at 4.5:1 in %s mode", (mode: string) => {
        const t = resolveTokens(cssRules, theme, mode === "dark")
        for (const role of ["success", "warning", "critical"]) {
          const opacity = step(variantClasses(role), mode === "dark" ? "dark:" : "", role)
          for (const ground of grounds) {
            const ratio = contrastRatio(t[`--${role}`], wash(t[`--${role}`], t[ground], opacity))
            expect(ratio, `${role} on its wash over ${ground}`).toBeGreaterThanOrEqual(4.5)
          }
        }
      })
    })
  })

  describe("notice pair", () => {
    const notice = ui("notice")
    const alert = ui("alert")
    const variantOf = (component: string) => {
      const match = notice.match(new RegExp(`function ${component}\\b[\\s\\S]*?<Alert\\b[^>]*?variant="(\\w+)"`))
      return match ? match[1] : "default"
    }
    const alertClasses = (variant: string) => alert.match(new RegExp(`\\b${variant}:\\s*"([^"]+)"`))![1]

    it("builds the error notice on the critical alert variant and the loading notice on the default", () => {
      expect(variantOf("ErrorNotice")).toBe("critical")
      expect(variantOf("LoadingNotice")).toBe("default")
    })

    describe.each(THEME_NAMES)("%s", (theme: string) => {
      it.each(MODES)("holds the loading notice's title and description on its card surface at 4.5:1 in %s mode", (mode: string) => {
        const t = resolveTokens(cssRules, theme, mode === "dark")
        expect(alertClasses("default")).toContain("bg-card")
        expect(alertClasses("default")).toContain("text-card-foreground")
        expect(contrastRatio(t["--card-foreground"], t["--card"]), "title on card").toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(t["--muted-foreground"], t["--card"]), "description on card").toBeGreaterThanOrEqual(4.5)
      })

      it.each(MODES)("holds the error notice's icon, title and description on the critical wash at 4.5:1 in %s mode", (mode: string) => {
        const t = resolveTokens(cssRules, theme, mode === "dark")
        const classes = alertClasses(variantOf("ErrorNotice"))
        const prefix = mode === "dark" ? "dark:" : ""
        const match = classes.match(new RegExp(`(?:^|\\s)${prefix}bg-critical/(\\d+)(?=\\s|$)`))
        expect(match, `${prefix}bg-critical/NN`).not.toBeNull()
        for (const ground of grounds) {
          const ratio = contrastRatio(t["--critical"], wash(t["--critical"], t[ground], Number(match![1]) / 100))
          expect(ratio, `critical on its wash over ${ground}`).toBeGreaterThanOrEqual(4.5)
        }
      })
    })
  })
})
