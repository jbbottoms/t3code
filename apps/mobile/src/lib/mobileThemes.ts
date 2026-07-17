export const MOBILE_THEME_IDS = [
  "system",
  "orion",
  "dracula",
  "solarized-dark",
  "solarized-light",
  "nord",
  "tokyo-night",
  "catppuccin-mocha",
  "gruvbox-dark",
  "one-dark",
] as const;

export type MobileThemeId = (typeof MOBILE_THEME_IDS)[number];
export type MobileThemeScheme = "light" | "dark";

export interface MobileThemeOption {
  readonly id: MobileThemeId;
  readonly label: string;
  readonly description: string;
  readonly scheme: MobileThemeScheme | "system";
  readonly swatches: readonly [string, string, string, string];
}

export interface MobileThemePalette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly foreground: string;
  readonly foregroundSecondary: string;
  readonly muted: string;
  readonly tertiary: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly primary?: string;
  readonly primaryForeground?: string;
  readonly link?: string;
  readonly bubble?: string;
  readonly black: string;
  readonly red: string;
  readonly green: string;
  readonly yellow: string;
  readonly blue: string;
  readonly magenta: string;
  readonly cyan: string;
  readonly white: string;
}

const SYSTEM_LIGHT: MobileThemePalette = {
  background: "#f2f2f7",
  surface: "#ffffff",
  surfaceAlt: "#f5f5f5",
  foreground: "#262626",
  foregroundSecondary: "#525252",
  muted: "#737373",
  tertiary: "#8e8e93",
  accent: "#007aff",
  accentForeground: "#ffffff",
  primary: "#262626",
  primaryForeground: "#ffffff",
  link: "#2563eb",
  bubble: "#007aff",
  black: "#1f1f21",
  red: "#dc2626",
  green: "#34c759",
  yellow: "#d98e00",
  blue: "#2563eb",
  magenta: "#a21caf",
  cyan: "#0891b2",
  white: "#f5f5f5",
};

const SYSTEM_DARK: MobileThemePalette = {
  background: "#0a0a0a",
  surface: "#171717",
  surfaceAlt: "#1c1c1c",
  foreground: "#f5f5f5",
  foregroundSecondary: "#a3a3a3",
  muted: "#8e8e93",
  tertiary: "#636366",
  accent: "#0a84ff",
  accentForeground: "#ffffff",
  primary: "#f5f5f5",
  primaryForeground: "#0a0a0a",
  link: "#60a5fa",
  bubble: "#0a84ff",
  black: "#141415",
  red: "#ff6762",
  green: "#5ecc71",
  yellow: "#ffca00",
  blue: "#60a5fa",
  magenta: "#d568ea",
  cyan: "#68cdf2",
  white: "#f5f5f5",
};

const CUSTOM_THEME_PALETTES = {
  orion: {
    background: "#111315",
    surface: "#191d20",
    surfaceAlt: "#22282d",
    foreground: "#f3f0e9",
    foregroundSecondary: "#c9c3b8",
    muted: "#9a958c",
    tertiary: "#5f666c",
    accent: "#ff7a18",
    accentForeground: "#111315",
    primary: "#ff7a18",
    primaryForeground: "#111315",
    link: "#6fb8ff",
    bubble: "#c95f12",
    black: "#0b0d0f",
    red: "#ff625f",
    green: "#74c991",
    yellow: "#ffd166",
    blue: "#6fb8ff",
    magenta: "#d58cff",
    cyan: "#63d5d1",
    white: "#f3f0e9",
  },
  dracula: {
    background: "#282a36",
    surface: "#343746",
    surfaceAlt: "#3b3e4f",
    foreground: "#f8f8f2",
    foregroundSecondary: "#d7d7d2",
    muted: "#a7a8b4",
    tertiary: "#6272a4",
    accent: "#bd93f9",
    accentForeground: "#282a36",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#8be9fd",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
  },
  "solarized-dark": {
    background: "#002b36",
    surface: "#073642",
    surfaceAlt: "#0b3d48",
    foreground: "#eee8d5",
    foregroundSecondary: "#93a1a1",
    muted: "#839496",
    tertiary: "#657b83",
    accent: "#268bd2",
    accentForeground: "#fdf6e3",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
  },
  "solarized-light": {
    background: "#fdf6e3",
    surface: "#eee8d5",
    surfaceAlt: "#e7dfca",
    foreground: "#586e75",
    foregroundSecondary: "#657b83",
    muted: "#839496",
    tertiary: "#93a1a1",
    accent: "#268bd2",
    accentForeground: "#fdf6e3",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#fdf6e3",
  },
  nord: {
    background: "#2e3440",
    surface: "#3b4252",
    surfaceAlt: "#434c5e",
    foreground: "#eceff4",
    foregroundSecondary: "#d8dee9",
    muted: "#aeb8c4",
    tertiary: "#4c566a",
    accent: "#88c0d0",
    accentForeground: "#2e3440",
    black: "#2e3440",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#8fbcbb",
    white: "#eceff4",
  },
  "tokyo-night": {
    background: "#1a1b26",
    surface: "#24283b",
    surfaceAlt: "#292e42",
    foreground: "#c0caf5",
    foregroundSecondary: "#a9b1d6",
    muted: "#737aa2",
    tertiary: "#565f89",
    accent: "#7aa2f7",
    accentForeground: "#1a1b26",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#c0caf5",
  },
  "catppuccin-mocha": {
    background: "#1e1e2e",
    surface: "#313244",
    surfaceAlt: "#45475a",
    foreground: "#cdd6f4",
    foregroundSecondary: "#bac2de",
    muted: "#a6adc8",
    tertiary: "#6c7086",
    accent: "#cba6f7",
    accentForeground: "#1e1e2e",
    black: "#181825",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#cba6f7",
    cyan: "#94e2d5",
    white: "#cdd6f4",
  },
  "gruvbox-dark": {
    background: "#282828",
    surface: "#3c3836",
    surfaceAlt: "#504945",
    foreground: "#ebdbb2",
    foregroundSecondary: "#d5c4a1",
    muted: "#a89984",
    tertiary: "#928374",
    accent: "#d79921",
    accentForeground: "#282828",
    black: "#1d2021",
    red: "#fb4934",
    green: "#b8bb26",
    yellow: "#fabd2f",
    blue: "#83a598",
    magenta: "#d3869b",
    cyan: "#8ec07c",
    white: "#fbf1c7",
  },
  "one-dark": {
    background: "#282c34",
    surface: "#21252b",
    surfaceAlt: "#2c313a",
    foreground: "#abb2bf",
    foregroundSecondary: "#9da5b4",
    muted: "#7f848e",
    tertiary: "#5c6370",
    accent: "#61afef",
    accentForeground: "#282c34",
    black: "#21252b",
    red: "#e06c75",
    green: "#98c379",
    yellow: "#e5c07b",
    blue: "#61afef",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    white: "#abb2bf",
  },
} as const satisfies Record<Exclude<MobileThemeId, "system">, MobileThemePalette>;

const CUSTOM_THEME_SCHEMES = {
  orion: "dark",
  dracula: "dark",
  "solarized-dark": "dark",
  "solarized-light": "light",
  nord: "dark",
  "tokyo-night": "dark",
  "catppuccin-mocha": "dark",
  "gruvbox-dark": "dark",
  "one-dark": "dark",
} as const satisfies Record<Exclude<MobileThemeId, "system">, MobileThemeScheme>;

export const MOBILE_THEME_OPTIONS: readonly MobileThemeOption[] = [
  {
    id: "system",
    label: "T3 System",
    description: "Follows iPhone",
    scheme: "system",
    swatches: ["#0a0a0a", "#f2f2f7", "#0a84ff", "#34c759"],
  },
  {
    id: "orion",
    label: "Orion",
    description: "Graphite + workbench orange",
    scheme: "dark",
    swatches: ["#111315", "#ff7a18", "#6f7a84", "#ffd166"],
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Dark",
    scheme: "dark",
    swatches: ["#282a36", "#bd93f9", "#50fa7b", "#ff79c6"],
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    description: "Dark",
    scheme: "dark",
    swatches: ["#002b36", "#268bd2", "#859900", "#b58900"],
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    description: "Light",
    scheme: "light",
    swatches: ["#fdf6e3", "#268bd2", "#859900", "#d33682"],
  },
  {
    id: "nord",
    label: "Nord",
    description: "Dark",
    scheme: "dark",
    swatches: ["#2e3440", "#88c0d0", "#a3be8c", "#b48ead"],
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    description: "Dark",
    scheme: "dark",
    swatches: ["#1a1b26", "#7aa2f7", "#9ece6a", "#bb9af7"],
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    description: "Dark",
    scheme: "dark",
    swatches: ["#1e1e2e", "#cba6f7", "#a6e3a1", "#f38ba8"],
  },
  {
    id: "gruvbox-dark",
    label: "Gruvbox Dark",
    description: "Dark",
    scheme: "dark",
    swatches: ["#282828", "#d79921", "#b8bb26", "#fb4934"],
  },
  {
    id: "one-dark",
    label: "One Dark",
    description: "Dark",
    scheme: "dark",
    swatches: ["#282c34", "#61afef", "#98c379", "#c678dd"],
  },
];

const MOBILE_THEME_ID_SET = new Set<string>(MOBILE_THEME_IDS);

export function normalizeMobileThemeId(value: unknown): MobileThemeId {
  return typeof value === "string" && MOBILE_THEME_ID_SET.has(value)
    ? (value as MobileThemeId)
    : "system";
}

export function resolveMobileThemeOption(themeId: MobileThemeId): MobileThemeOption {
  return MOBILE_THEME_OPTIONS.find((option) => option.id === themeId) ?? MOBILE_THEME_OPTIONS[0]!;
}

export function resolveMobileThemeScheme(
  themeId: MobileThemeId,
  systemScheme: MobileThemeScheme,
): MobileThemeScheme {
  return themeId === "system" ? systemScheme : CUSTOM_THEME_SCHEMES[themeId];
}

export function resolveMobileThemePalette(
  themeId: MobileThemeId,
  systemScheme: MobileThemeScheme,
): MobileThemePalette {
  if (themeId === "system") {
    return systemScheme === "light" ? SYSTEM_LIGHT : SYSTEM_DARK;
  }
  return CUSTOM_THEME_PALETTES[themeId];
}

function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function resolveMobileThemeVariables(
  themeId: MobileThemeId,
  systemScheme: MobileThemeScheme,
): Record<string, string> {
  const palette = resolveMobileThemePalette(themeId, systemScheme);
  const primary = palette.primary ?? palette.accent;
  const primaryForeground = palette.primaryForeground ?? palette.accentForeground;
  const link = palette.link ?? palette.accent;
  const bubble = palette.bubble ?? palette.accent;

  return {
    "--color-screen": palette.background,
    "--color-sheet": colorWithAlpha(palette.background, 0.98),
    "--color-card": palette.surface,
    "--color-card-alt": palette.surfaceAlt,
    "--color-card-translucent": colorWithAlpha(palette.surface, 0.82),
    "--color-foreground": palette.foreground,
    "--color-foreground-secondary": palette.foregroundSecondary,
    "--color-foreground-muted": palette.muted,
    "--color-foreground-tertiary": palette.tertiary,
    "--color-border": colorWithAlpha(palette.foreground, 0.09),
    "--color-border-subtle": colorWithAlpha(palette.foreground, 0.065),
    "--color-separator": colorWithAlpha(palette.foreground, 0.045),
    "--color-subtle": colorWithAlpha(palette.foreground, 0.055),
    "--color-subtle-strong": colorWithAlpha(palette.foreground, 0.1),
    "--color-inline-skill-background": colorWithAlpha(palette.magenta, 0.14),
    "--color-inline-skill-border": colorWithAlpha(palette.magenta, 0.3),
    "--color-inline-skill-foreground": palette.magenta,
    "--color-primary": primary,
    "--color-primary-foreground": primaryForeground,
    "--color-primary-shadow": colorWithAlpha(palette.black, 0.26),
    "--color-secondary": palette.surfaceAlt,
    "--color-secondary-foreground": palette.foreground,
    "--color-secondary-border": colorWithAlpha(palette.foreground, 0.09),
    "--color-switch-active": palette.green,
    "--color-danger": colorWithAlpha(palette.red, 0.16),
    "--color-danger-border": colorWithAlpha(palette.red, 0.28),
    "--color-danger-foreground": palette.red,
    "--color-input": palette.surface,
    "--color-input-border": colorWithAlpha(palette.foreground, 0.12),
    "--color-sidebar-search": colorWithAlpha(palette.foreground, 0.11),
    "--color-placeholder": palette.muted,
    "--color-icon": palette.foreground,
    "--color-icon-muted": palette.foregroundSecondary,
    "--color-icon-subtle": palette.muted,
    "--color-header": colorWithAlpha(palette.background, 0.97),
    "--color-header-border": colorWithAlpha(palette.foreground, 0.07),
    "--color-glass-surface": colorWithAlpha(palette.surface, 0.78),
    "--color-glass-tint": colorWithAlpha(palette.surface, 0.24),
    "--color-status-bar": palette.background,
    "--color-md-body": palette.foreground,
    "--color-md-strong": palette.white,
    "--color-md-link": link,
    "--color-md-blockquote-border": colorWithAlpha(palette.foreground, 0.12),
    "--color-md-blockquote-bg": colorWithAlpha(palette.foreground, 0.035),
    "--color-md-code-bg": colorWithAlpha(palette.foreground, 0.07),
    "--color-md-code-text": palette.foreground,
    "--color-md-user-code-bg": colorWithAlpha(palette.white, 0.18),
    "--color-md-user-code-text": palette.white,
    "--color-md-user-fence-bg": colorWithAlpha(palette.black, 0.3),
    "--color-md-user-fence-text": palette.white,
    "--color-md-hr": colorWithAlpha(palette.foreground, 0.1),
    "--color-user-bubble": bubble,
    "--color-user-bubble-foreground": palette.accentForeground,
    "--color-user-bubble-foreground-muted": colorWithAlpha(palette.accentForeground, 0.78),
    "--color-backdrop": colorWithAlpha(palette.black, 0.5),
    "--color-drawer": colorWithAlpha(palette.background, 0.99),
    "--color-drawer-shadow": colorWithAlpha(palette.black, 0.34),
    "--color-dot-separator": colorWithAlpha(palette.foreground, 0.22),
    "--color-wordmark": palette.foreground,
    "--color-chevron": colorWithAlpha(palette.foreground, 0.24),
  };
}

export function resolveMobileTerminalPalette(
  themeId: MobileThemeId,
  systemScheme: MobileThemeScheme,
) {
  const palette = resolveMobileThemePalette(themeId, systemScheme);
  return {
    background: palette.background,
    foreground: palette.foreground,
    mutedForeground: palette.muted,
    border: colorWithAlpha(palette.foreground, 0.12),
    cursorForeground: palette.accent,
    cursorBackground: palette.background,
    palette: [
      palette.black,
      palette.red,
      palette.green,
      palette.yellow,
      palette.blue,
      palette.magenta,
      palette.cyan,
      palette.foregroundSecondary,
      palette.tertiary,
      palette.red,
      palette.green,
      palette.yellow,
      palette.blue,
      palette.magenta,
      palette.cyan,
      palette.white,
    ] as const,
  };
}
