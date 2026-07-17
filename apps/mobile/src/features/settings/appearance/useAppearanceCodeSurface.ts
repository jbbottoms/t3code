import { useMemo } from "react";

import {
  resolveMobileCodeSurface,
  type ResolvedMobileCodeSurface,
} from "../../../lib/appearancePreferences";
import type { MobileThemeId } from "../../../lib/mobileThemes";
import { createNativeReviewDiffStyle } from "../../review/nativeReviewDiffAdapter";
import { createNativeSourceStyle } from "../../files/nativeSourceFileAdapter";
import { useAppearancePreferences } from "./AppearancePreferencesProvider";

export function useAppearanceCodeSurface(): {
  readonly codeSurface: ResolvedMobileCodeSurface;
  readonly codeWordBreak: boolean;
  readonly themeId: MobileThemeId;
  readonly nativeSourceStyle: ReturnType<typeof createNativeSourceStyle>;
  readonly nativeReviewDiffStyle: ReturnType<typeof createNativeReviewDiffStyle>;
} {
  const { appearance } = useAppearancePreferences();
  const codeSurface = useMemo(
    () => resolveMobileCodeSurface(appearance.codeFontSize),
    [appearance.codeFontSize],
  );
  const nativeSourceStyle = useMemo(() => createNativeSourceStyle(codeSurface), [codeSurface]);
  const nativeReviewDiffStyle = useMemo(
    () => createNativeReviewDiffStyle(codeSurface),
    [codeSurface],
  );

  return {
    codeSurface,
    codeWordBreak: appearance.codeWordBreak,
    themeId: appearance.themeId,
    nativeSourceStyle,
    nativeReviewDiffStyle,
  };
}
