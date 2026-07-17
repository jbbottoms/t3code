import { createContext, use, useCallback, useEffect, useMemo, type ReactNode } from "react";

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";

import { Uniwind } from "uniwind";

import {
  resolveAppearance,
  resolveAppearancePreferences,
  resolveTextScaleVariables,
  type AppearancePreferences,
  type ResolvedAppearance,
} from "../../../lib/appearancePreferences";
import {
  resolveMobileThemeOption,
  resolveMobileThemeVariables,
  type MobileThemeId,
  type MobileThemeScheme,
} from "../../../lib/mobileThemes";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../state/preferences";
import { cacheTerminalFontSize } from "../../terminal/terminalUiState";

interface AppearancePreferencesContextValue {
  /** Effective values with base-size derivation applied. Use this for rendering. */
  readonly appearance: ResolvedAppearance;
  readonly isReady: boolean;
  readonly setThemeId: (value: MobileThemeId) => void;
  readonly setBaseFontSize: (value: number) => void;
  /** Pass null to clear the override and follow the base font size. */
  readonly setTerminalFontSize: (value: number | null) => void;
  /** Pass null to clear the override and follow the base font size. */
  readonly setCodeFontSize: (value: number | null) => void;
  readonly setCodeWordBreak: (value: boolean) => void;
}

const AppearancePreferencesContext = createContext<AppearancePreferencesContextValue | null>(null);

/**
 * Injects the scaled `--text-*` variables into Uniwind so every
 * className-based text size (`text-sm`, `text-base`, ...) re-resolves live.
 * Updates the current theme last so the active stylesheet settles correctly.
 */
function applyAppearanceVariables(preferences: AppearancePreferences) {
  const textVariables = resolveTextScaleVariables(preferences.baseFontSize);

  for (const scheme of ["light", "dark"] as const satisfies readonly MobileThemeScheme[]) {
    Uniwind.updateCSSVariables(scheme, {
      ...resolveMobileThemeVariables(preferences.themeId, scheme),
      ...textVariables,
    });
  }

  const selected = resolveMobileThemeOption(preferences.themeId).scheme;
  Uniwind.setTheme(selected === "system" ? "system" : selected);
}

export function AppearancePreferencesProvider(props: { readonly children: ReactNode }) {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useMemo(
    () =>
      resolveAppearancePreferences(
        AsyncResult.isSuccess(preferencesResult) ? preferencesResult.value : null,
      ),
    [preferencesResult],
  );
  const isReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;

  useEffect(() => {
    applyAppearanceVariables(preferences);
    cacheTerminalFontSize(resolveAppearance(preferences).terminalFontSize);
  }, [preferences]);

  const updatePreferences = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      savePreferences(patch);
    },
    [savePreferences],
  );

  const setBaseFontSize = useCallback(
    (value: number) => {
      updatePreferences({ baseFontSize: value });
    },
    [updatePreferences],
  );

  const setThemeId = useCallback(
    (value: MobileThemeId) => {
      updatePreferences({ themeId: value });
    },
    [updatePreferences],
  );

  const setTerminalFontSize = useCallback(
    (value: number | null) => {
      updatePreferences({ terminalFontSize: value });
    },
    [updatePreferences],
  );

  const setCodeFontSize = useCallback(
    (value: number | null) => {
      updatePreferences({ codeFontSize: value });
    },
    [updatePreferences],
  );

  const setCodeWordBreak = useCallback(
    (value: boolean) => {
      updatePreferences({ codeWordBreak: value });
    },
    [updatePreferences],
  );

  const value = useMemo(
    (): AppearancePreferencesContextValue => ({
      appearance: resolveAppearance(preferences),
      isReady,
      setThemeId,
      setBaseFontSize,
      setTerminalFontSize,
      setCodeFontSize,
      setCodeWordBreak,
    }),
    [
      preferences,
      isReady,
      setThemeId,
      setBaseFontSize,
      setTerminalFontSize,
      setCodeFontSize,
      setCodeWordBreak,
    ],
  );

  return (
    <AppearancePreferencesContext.Provider value={value}>
      {props.children}
    </AppearancePreferencesContext.Provider>
  );
}

export function useAppearancePreferences(): AppearancePreferencesContextValue {
  const context = use(AppearancePreferencesContext);
  if (!context) {
    throw new Error("useAppearancePreferences must be used within AppearancePreferencesProvider");
  }
  return context;
}
