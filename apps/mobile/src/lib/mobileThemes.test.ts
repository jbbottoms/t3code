import { describe, expect, it } from "vite-plus/test";

import {
  MOBILE_THEME_IDS,
  MOBILE_THEME_OPTIONS,
  normalizeMobileThemeId,
  resolveMobileTerminalPalette,
  resolveMobileThemePalette,
  resolveMobileThemeScheme,
  resolveMobileThemeVariables,
} from "./mobileThemes";

describe("mobileThemes", () => {
  it("ships the requested popular theme catalog", () => {
    expect(MOBILE_THEME_IDS).toHaveLength(10);
    expect(new Set(MOBILE_THEME_IDS).size).toBe(MOBILE_THEME_IDS.length);
    expect(MOBILE_THEME_IDS).toEqual(
      expect.arrayContaining([
        "orion",
        "dracula",
        "solarized-dark",
        "solarized-light",
        "nord",
        "tokyo-night",
        "catppuccin-mocha",
        "gruvbox-dark",
        "one-dark",
      ]),
    );
    expect(MOBILE_THEME_OPTIONS.map((option) => option.id)).toEqual(MOBILE_THEME_IDS);
  });

  it("normalizes unknown persisted values back to system", () => {
    expect(normalizeMobileThemeId("dracula")).toBe("dracula");
    expect(normalizeMobileThemeId("not-a-theme")).toBe("system");
    expect(normalizeMobileThemeId(null)).toBe("system");
  });

  it("follows the device only for the system theme", () => {
    expect(resolveMobileThemeScheme("system", "light")).toBe("light");
    expect(resolveMobileThemeScheme("system", "dark")).toBe("dark");
    expect(resolveMobileThemeScheme("dracula", "light")).toBe("dark");
    expect(resolveMobileThemeScheme("solarized-light", "dark")).toBe("light");
  });

  it("provides the same complete semantic token set for every theme", () => {
    const reference = Object.keys(resolveMobileThemeVariables("system", "light")).sort();
    expect(reference.length).toBeGreaterThan(50);

    for (const themeId of MOBILE_THEME_IDS) {
      expect(Object.keys(resolveMobileThemeVariables(themeId, "dark")).sort()).toEqual(reference);
    }
  });

  it("drives both app surfaces and the 16-color terminal palette", () => {
    const dracula = resolveMobileThemePalette("dracula", "light");
    const variables = resolveMobileThemeVariables("dracula", "light");
    const terminal = resolveMobileTerminalPalette("dracula", "light");

    expect(variables["--color-screen"]).toBe(dracula.background);
    expect(variables["--color-md-link"]).toBe(dracula.accent);
    expect(terminal.background).toBe(dracula.background);
    expect(terminal.cursorForeground).toBe(dracula.accent);
    expect(terminal.palette).toHaveLength(16);
  });

  it("gives Orion an authored graphite and orange palette", () => {
    const orion = resolveMobileThemePalette("orion", "light");

    expect(orion.background).toBe("#111315");
    expect(orion.accent).toBe("#ff7a18");
    expect(resolveMobileThemeScheme("orion", "light")).toBe("dark");
  });
});
