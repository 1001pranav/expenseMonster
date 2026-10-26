import { useColorScheme } from 'react-native';
import { useStore } from '@/db/store';

/**
 * "Glass ledger": translucent cards over a soft green-and-blue glow. Forest/emerald for actions and
 * good news, cobalt for money coming in, red for late, amber for due soon. Text sits on near-solid
 * surfaces, so every text pair still passes WCAG AA (≥ 4.5:1) against the page under the glass.
 */
const palette = {
  light: {
    bg: '#EEF3F1',
    surface: 'rgba(255,255,255,0.78)',
    surfaceAlt: 'rgba(16,48,38,0.06)',
    /** Opaque: sheets and anything that floats over other content. */
    elevated: '#FFFFFF',
    border: 'rgba(16,48,38,0.10)',
    /** Glass cards and tiles: a white veil with a light rim. */
    glass: 'rgba(255,255,255,0.66)',
    glassBorder: 'rgba(255,255,255,0.95)',
    /** Bars pinned to the screen edge (footer, tab bar). */
    chrome: 'rgba(246,250,248,0.94)',
    /** The page backdrop: two soft glows on the page colour. */
    glowA: '#34D399',
    glowB: '#60A5FA',
    glowOpacity: 0.32,
    text: '#12201A',
    textMuted: '#4E5D55',
    textFaint: '#5E6C64',
    primary: '#0F6B53',
    primaryText: '#FFFFFF',
    primarySoft: '#DDF1E8',
    primaryOnSoft: '#0B5642',
    /** Paid, on track, approved: the brand green, never used for money in. */
    good: '#0F6B53',
    goodSoft: '#DDF1E8',
    goodText: '#0B5642',
    /** Money coming in (income, refunds, money owed to you). */
    income: '#1D4ED8',
    incomeSoft: '#E3EBFF',
    incomeText: '#1D4ED8',
    expense: '#B42318',
    expenseSoft: '#FEE4E2',
    expenseText: '#B42318',
    warn: '#B7791F',
    warnSoft: '#FDF0D5',
    warnText: '#8A5A00',
    info: '#1D4ED8',
    infoSoft: '#E3EBFF',
    infoText: '#1D4ED8',
    overlay: 'rgba(10,24,19,0.5)',
    chartTrack: 'rgba(16,48,38,0.10)',
    tabBar: 'rgba(246,250,248,0.94)',
    /** Lock screen, onboarding and the hero card: forest flowing into cobalt. */
    heroBase: '#0F5C4A',
    heroGlowA: '#10B981',
    heroGlowB: '#1D4ED8',
    heroGlowC: '#0B4A3B',
  },
  dark: {
    bg: '#07110F',
    surface: 'rgba(255,255,255,0.07)',
    surfaceAlt: 'rgba(255,255,255,0.09)',
    elevated: '#0F1D19',
    border: 'rgba(255,255,255,0.11)',
    glass: 'rgba(255,255,255,0.065)',
    glassBorder: 'rgba(255,255,255,0.13)',
    chrome: 'rgba(9,20,17,0.94)',
    glowA: '#10B981',
    glowB: '#3B82F6',
    glowOpacity: 0.3,
    text: '#F1F6F3',
    textMuted: '#B3C2BA',
    textFaint: '#95A69C',
    primary: '#34D399',
    primaryText: '#04130D',
    primarySoft: 'rgba(52,211,153,0.16)',
    primaryOnSoft: '#6EE7B7',
    good: '#34D399',
    goodSoft: 'rgba(52,211,153,0.16)',
    goodText: '#6EE7B7',
    income: '#82AAFF',
    incomeSoft: 'rgba(130,170,255,0.16)',
    incomeText: '#9DBCFF',
    expense: '#FF8A80',
    expenseSoft: 'rgba(255,138,128,0.15)',
    expenseText: '#FF9C93',
    warn: '#FBBF5A',
    warnSoft: 'rgba(251,191,90,0.15)',
    warnText: '#FCC96E',
    info: '#82AAFF',
    infoSoft: 'rgba(130,170,255,0.16)',
    infoText: '#9DBCFF',
    overlay: 'rgba(0,0,0,0.62)',
    chartTrack: 'rgba(255,255,255,0.10)',
    tabBar: 'rgba(9,20,17,0.94)',
    heroBase: '#0E3B32',
    heroGlowA: '#10B981',
    heroGlowB: '#2563EB',
    heroGlowC: '#0A2A24',
  },
};

/**
 * Tile names kept for call sites; colour no longer encodes what a tile is. Only `brand` is filled
 * (forest), every other tile is a neutral sage square with a muted icon (see GradientTile).
 */
export const gradients = {
  brand: ['#0F5C4A', '#0F5C4A'],
  violet: ['#0F5C4A', '#0F5C4A'],
  sunset: ['#0F5C4A', '#0F5C4A'],
  rose: ['#0F5C4A', '#0F5C4A'],
  mint: ['#0F5C4A', '#0F5C4A'],
  ocean: ['#0F5C4A', '#0F5C4A'],
  marigold: ['#0F5C4A', '#0F5C4A'],
  ink: ['#0F5C4A', '#0F5C4A'],
} as const;
export type GradientName = keyof typeof gradients;

export type Colors = typeof palette.light;

export const space = (n: number) => n * 8;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  /** One family throughout: Manrope's heavier cuts carry headings and big amounts. */
  display: 'Manrope_800ExtraBold',
  displaySemi: 'Manrope_700Bold',
};

export const type = {
  display: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, letterSpacing: -1.8 },
  h1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 27, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
} as const;
export type TypeVariant = keyof typeof type;

export function useTheme() {
  const system = useColorScheme();
  const pref = useStore((s) => s.settings.theme);
  const scheme = pref === 'system' ? (system ?? 'light') : pref;
  const colors = palette[scheme === 'dark' ? 'dark' : 'light'];
  return { colors, scheme, dark: scheme === 'dark' };
}

/**
 * Glass cards get a light rim, not a shadow: Android draws elevation shadows through translucent
 * views, which reads as a grey smudge.
 */
export const shadow = (dark: boolean) => ({ borderWidth: 1, borderColor: dark ? palette.dark.glassBorder : palette.light.glassBorder });

/** Mix a #RRGGBB colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
