import { useColorScheme, type TextStyle } from 'react-native';
import { useStore } from '@/db/store';

/**
 * "Paper and ink": warm off-white paper, near-black ink and one fountain-pen blue accent. No glows,
 * gradients or translucency. Expenses are plain ink (they're most rows, and red all day isn't calm);
 * income is green and always carries a + sign or an arrow-in icon, so colour is never the only cue.
 * Red and amber are for status only (overdue, over budget, due soon). Every text pair passes WCAG AA
 * against bg, surface and surfaceAlt; see docs/REDESIGN_SPEC.md §3.1 for the measured ratios.
 */
const palette = {
  light: {
    bg: '#F6F5F1',
    surface: '#FFFFFF',
    /** Keypad keys, unselected chips, skeletons, progress tracks. */
    surfaceAlt: '#EDEBE5',
    /** Sheets and anything that floats over other content. */
    elevated: '#FFFFFF',
    border: '#E2DFD7',
    /** Input and control outlines: 3:1 against the page, as WCAG asks of UI boundaries. */
    borderStrong: '#8D897F',
    /** Cards: opaque now. Kept under the old names so call sites don't change. */
    glass: '#FFFFFF',
    glassBorder: '#E2DFD7',
    /** Bars pinned to the screen edge (footer, tab bar). */
    chrome: '#F6F5F1',
    text: '#1A1A17',
    textMuted: '#57554E',
    textFaint: '#66635B',
    primary: '#2747A0',
    primaryText: '#FFFFFF',
    primarySoft: '#E7ECF8',
    primaryOnSoft: '#2747A0',
    good: '#17703F',
    goodSoft: '#E3F1E8',
    goodText: '#17703F',
    /** Money coming in (income, refunds, money owed to you). */
    income: '#17703F',
    incomeSoft: '#E3F1E8',
    incomeText: '#17703F',
    /** Status only: overdue, over budget, delete. Ordinary expense amounts use `text`. */
    expense: '#B42318',
    expenseSoft: '#FBE9E7',
    expenseText: '#B42318',
    warn: '#8A5300',
    warnSoft: '#F8EEDC',
    warnText: '#8A5300',
    info: '#2747A0',
    infoSoft: '#E7ECF8',
    infoText: '#2747A0',
    overlay: 'rgba(26,26,23,0.4)',
    chartTrack: '#EDEBE5',
    tabBar: '#F6F5F1',
    /** Lock screen, onboarding and hero cards: one flat ink-blue surface. */
    heroBase: '#1C3577',
  },
  dark: {
    bg: '#121210',
    surface: '#1C1B18',
    surfaceAlt: '#252420',
    elevated: '#1C1B18',
    border: '#2E2D29',
    borderStrong: '#6B685F',
    glass: '#1C1B18',
    glassBorder: '#2E2D29',
    chrome: '#121210',
    text: '#F2F0EA',
    textMuted: '#B5B2A8',
    textFaint: '#97948A',
    primary: '#9DB4F5',
    primaryText: '#10183A',
    primarySoft: 'rgba(157,180,245,0.16)',
    primaryOnSoft: '#C4D2FA',
    good: '#6FCF97',
    goodSoft: 'rgba(111,207,151,0.14)',
    goodText: '#6FCF97',
    income: '#6FCF97',
    incomeSoft: 'rgba(111,207,151,0.14)',
    incomeText: '#6FCF97',
    expense: '#FF8A80',
    expenseSoft: 'rgba(255,138,128,0.14)',
    expenseText: '#FF8A80',
    warn: '#F0B860',
    warnSoft: 'rgba(240,184,96,0.14)',
    warnText: '#F0B860',
    info: '#9DB4F5',
    infoSoft: 'rgba(157,180,245,0.16)',
    infoText: '#9DB4F5',
    overlay: 'rgba(0,0,0,0.6)',
    chartTrack: '#2E2D29',
    tabBar: '#121210',
    heroBase: '#1C1B18',
  },
};

/**
 * Tile names kept for call sites; colour doesn't encode what a tile is. Only `brand` is filled
 * (the accent), every other tile is a neutral square with a muted icon (see GradientTile).
 */
export const gradients = {
  brand: ['#2747A0', '#2747A0'],
  violet: ['#2747A0', '#2747A0'],
  sunset: ['#2747A0', '#2747A0'],
  rose: ['#2747A0', '#2747A0'],
  mint: ['#2747A0', '#2747A0'],
  ocean: ['#2747A0', '#2747A0'],
  marigold: ['#2747A0', '#2747A0'],
  ink: ['#2747A0', '#2747A0'],
} as const;
export type GradientName = keyof typeof gradients;

export type Colors = typeof palette.light;

export const space = (n: number) => n * 8;
/** Small radii on purpose: big rounded corners read as a toy. Sheets use xl at the top only. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

/**
 * The system font (SF Pro on iOS, Roboto on Android): native, best dynamic-type support and true
 * tabular figures. These are weights, used as `fontWeight: fonts.bold`; names kept from the old
 * Manrope cuts so call sites read the same.
 */
export const fonts = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  display: '700',
  displaySemi: '600',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/** No negative tracking: tight display type was a big part of the old "template" look. */
export const type = {
  display: { fontWeight: '600', fontSize: 40, lineHeight: 48, letterSpacing: 0 },
  h1: { fontWeight: fonts.display, fontSize: 22, lineHeight: 28 },
  h2: { fontWeight: fonts.displaySemi, fontSize: 18, lineHeight: 24 },
  h3: { fontWeight: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontWeight: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontWeight: fonts.semibold, fontSize: 16, lineHeight: 22 },
  small: { fontWeight: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontWeight: fonts.medium, fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, TextStyle>;
export type TypeVariant = keyof typeof type;

export function useTheme() {
  const system = useColorScheme();
  const pref = useStore((s) => s.settings.theme);
  const scheme = pref === 'system' ? (system ?? 'light') : pref;
  const colors = palette[scheme === 'dark' ? 'dark' : 'light'];
  return { colors, scheme, dark: scheme === 'dark' };
}

/** Cards get a hairline, not a shadow: hierarchy comes from lines and spacing (spec §3.3). */
export const shadow = (dark: boolean) => ({ borderWidth: 1, borderColor: dark ? palette.dark.glassBorder : palette.light.glassBorder });

/** Mix a #RRGGBB colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
