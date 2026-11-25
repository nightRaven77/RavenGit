export type ThemeId =
  | "obsidian"
  | "raven-violet"
  | "emerald-abyss"
  | "crimson-dusk"
  | "nordic-slate"
  | "arctic-light"
  | "high-contrast";

export type GraphPaletteId =
  "kraken" | "identity" | "neon" | "pastel" | "accessible";

export type ExternalKind = "editor" | "terminal" | "explorer";

export interface ExternalApp {
  id: string;
  name: string;
  kind: ExternalKind;
  command: string;
  custom: boolean;
}

export interface ExternalPreferences {
  preferredEditorId: string | null;
  preferredTerminalId: string | null;
  customEditorPath: string | null;
  customEditorName: string | null;
}

export interface ExternalAppsState {
  editors: ExternalApp[];
  terminals: ExternalApp[];
  explorer: ExternalApp;
  preferences: ExternalPreferences;
}

export interface OpenExternalOutcome {
  appId: string;
  appName: string;
  kind: ExternalKind;
  message: string;
}

export interface AppSettings {
  version: number;
  theme: ThemeId;
  graphPalette: GraphPaletteId;
  external: ExternalPreferences;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  badge: string;
  scheme: "dark" | "light";
  swatches: [string, string, string, string];
}

export interface GraphPaletteDefinition {
  id: GraphPaletteId;
  name: string;
  description: string;
  darkColors: string[];
  lightColors: string[];
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 1,
  theme: "obsidian",
  graphPalette: "kraken",
  external: {
    preferredEditorId: null,
    preferredTerminalId: null,
    customEditorPath: null,
    customEditorName: null,
  },
};

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "obsidian",
    name: "Obsidian (Identidad)",
    description: "Paleta oficial de RavenGit en azul abisal, Azure y carmesí.",
    badge: "Identidad oficial",
    scheme: "dark",
    swatches: ["#0b0f17", "#101620", "#52b7ff", "#ff667d"],
  },
  {
    id: "raven-violet",
    name: "Cuervo Nocturno",
    description: "Superficies índigo profundas con acentos amatista y cian.",
    badge: "Oscuro",
    scheme: "dark",
    swatches: ["#0d0b1a", "#161229", "#a78bfa", "#38bdf8"],
  },
  {
    id: "emerald-abyss",
    name: "Abismo Esmeralda",
    description: "Verde petróleo sereno con reflejos esmeralda y turquesa.",
    badge: "Oscuro",
    scheme: "dark",
    swatches: ["#081312", "#0f1f1e", "#34d399", "#22d3ee"],
  },
  {
    id: "crimson-dusk",
    name: "Ojo Carmesí",
    description: "Grafito cálido inspirado en el ojo del cuervo con ámbar.",
    badge: "Oscuro",
    scheme: "dark",
    swatches: ["#130d12", "#1d141b", "#ff667d", "#fbbf24"],
  },
  {
    id: "nordic-slate",
    name: "Pizarra Nórdica",
    description: "Tonos pizarra equilibrados con azul hielo y menta suave.",
    badge: "Oscuro",
    scheme: "dark",
    swatches: ["#151a23", "#1d2431", "#7dd3fc", "#6ee7b7"],
  },
  {
    id: "arctic-light",
    name: "Ártico (Claro)",
    description: "Superficie diurna limpia con contraste nítido para código.",
    badge: "Claro",
    scheme: "light",
    swatches: ["#f5f7fb", "#ffffff", "#0284c7", "#e11d48"],
  },
  {
    id: "high-contrast",
    name: "Alto Contraste",
    description:
      "Negro puro, bordes definidos y foco amarillo de alta lectura.",
    badge: "Accesibilidad",
    scheme: "dark",
    swatches: ["#000000", "#0b0f14", "#60c8ff", "#ffe066"],
  },
];

export const GRAPH_PALETTES: readonly GraphPaletteDefinition[] = [
  {
    id: "kraken",
    name: "Vibrante (GitKraken)",
    description:
      "Diez carriles intensos y bien diferenciados para múltiples ramas.",
    darkColors: [
      "#38bdf8",
      "#34d399",
      "#fb7185",
      "#fbbf24",
      "#a78bfa",
      "#2dd4bf",
      "#fb923c",
      "#e879f9",
      "#a3e635",
      "#60a5fa",
    ],
    lightColors: [
      "#0284c7",
      "#059669",
      "#e11d48",
      "#d97706",
      "#7c3aed",
      "#0d9488",
      "#ea580c",
      "#c026d3",
      "#65a30d",
      "#2563eb",
    ],
  },
  {
    id: "identity",
    name: "Identidad Extendida",
    description: "Armonía cromática nacida de Azure, Carmesí y Esmeralda.",
    darkColors: [
      "#52b7ff",
      "#ff667d",
      "#62d6a7",
      "#d8b46a",
      "#b1a2f5",
      "#5cd6d6",
      "#ff8e6e",
      "#7aa2ff",
    ],
    lightColors: [
      "#0369a1",
      "#be123c",
      "#047857",
      "#b45309",
      "#6d28d9",
      "#0f766e",
      "#c2410c",
      "#1d4ed8",
    ],
  },
  {
    id: "neon",
    name: "Neón Eléctrico",
    description: "Colores luminosos de máximo impacto sobre fondos oscuros.",
    darkColors: [
      "#00e5ff",
      "#ff3d8b",
      "#22ff88",
      "#ffd600",
      "#b388ff",
      "#ff9100",
      "#1de9b6",
      "#ff5252",
      "#76ff03",
      "#40c4ff",
    ],
    lightColors: [
      "#00838f",
      "#c2185b",
      "#00897b",
      "#ef6c00",
      "#5e35b1",
      "#d84315",
      "#00796b",
      "#c62828",
      "#33691e",
      "#0277bd",
    ],
  },
  {
    id: "pastel",
    name: "Tributary Suave",
    description:
      "Tonos editoriales balanceados para largas sesiones de lectura.",
    darkColors: [
      "#7dd3fc",
      "#86efac",
      "#fda4af",
      "#fde047",
      "#c4b5fd",
      "#5eead4",
      "#fdba74",
      "#f0abfc",
      "#bef264",
      "#93c5fd",
    ],
    lightColors: [
      "#0369a1",
      "#15803d",
      "#be123c",
      "#a16207",
      "#6d28d9",
      "#0f766e",
      "#c2410c",
      "#a21caf",
      "#4d7c0f",
      "#1d4ed8",
    ],
  },
  {
    id: "accessible",
    name: "Alta Distinción",
    description: "Paleta segura para daltonismo basada en Okabe-Ito extendida.",
    darkColors: [
      "#56b4e9",
      "#e69f00",
      "#009e73",
      "#cc79a7",
      "#f0e442",
      "#d55e00",
      "#78a6ff",
      "#99e6b3",
    ],
    lightColors: [
      "#0072b2",
      "#d55e00",
      "#007a59",
      "#a8467d",
      "#9c8200",
      "#b54200",
      "#1d4ed8",
      "#15803d",
    ],
  },
];

const THEME_STORAGE_KEY = "ravengit.appearance.theme";
const PALETTE_STORAGE_KEY = "ravengit.appearance.graphPalette";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((item) => item.id === value);
}

export function isGraphPaletteId(value: unknown): value is GraphPaletteId {
  return (
    typeof value === "string" &&
    GRAPH_PALETTES.some((item) => item.id === value)
  );
}

export function resolveGraphColors(
  paletteId: GraphPaletteId,
  themeId: ThemeId,
): readonly string[] {
  const palette =
    GRAPH_PALETTES.find((item) => item.id === paletteId) ?? GRAPH_PALETTES[0];
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  return theme.scheme === "light" ? palette.lightColors : palette.darkColors;
}

export function loadCachedAppearance(): {
  theme: ThemeId;
  graphPalette: GraphPaletteId;
} {
  try {
    const rawTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const rawPalette = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    return {
      theme: isThemeId(rawTheme) ? rawTheme : DEFAULT_APP_SETTINGS.theme,
      graphPalette: isGraphPaletteId(rawPalette)
        ? rawPalette
        : DEFAULT_APP_SETTINGS.graphPalette,
    };
  } catch {
    return {
      theme: DEFAULT_APP_SETTINGS.theme,
      graphPalette: DEFAULT_APP_SETTINGS.graphPalette,
    };
  }
}

export function applyAppearance(
  themeId: ThemeId,
  graphPaletteId: GraphPaletteId,
): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = themeId;
    document.documentElement.dataset.graphPalette = graphPaletteId;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    window.localStorage.setItem(PALETTE_STORAGE_KEY, graphPaletteId);
  } catch {
    // Ignore storage unavailability in restricted contexts.
  }
}
