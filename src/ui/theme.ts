import { useColorScheme } from 'react-native';
import { useStore } from '@/db/store';

/**
 * "Ledger + Clear": sage paper, ink text, forest green for actions and good news, cobalt for money
 * coming in, red for late and amber for due soon. Every text pair passes WCAG AA (≥ 4.5:1).
 */
const palette = {
  light: {
    bg: '#F4F6F3',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF2EE',
    elevated: '#FFFFFF',
    border: '#E3E8E3',
    text: '#14201B',
    textMuted: '#56635C',
    textFaint: '#616D66',
    primary: '#0F5C4A',
    primaryText: '#FFFFFF',
    primarySoft: '#E2EFE9',
    primaryOnSoft: '#0F5C4A',
    /** Paid, on track, approved: the brand green, never used for money in. */
    good: '#0F5C4A',
    goodSoft: '#E2EFE9',
    goodText: '#0F5C4A',
    /** Money coming in (income, refunds, money owed to you). */
    income: '#1F4FD8',
    incomeSoft: '#E6EDFE',
    incomeText: '#1F4FD8',
    expense: '#B42318',
    expenseSoft: '#FEE4E2',
    expenseText: '#B42318',
    warn: '#B7791F',
    warnSoft: '#FDF0D5',
    warnText: '#8A5A00',
    info: '#1F4FD8',
    infoSoft: '#E6EDFE',
    infoText: '#1F4FD8',
    overlay: 'rgba(20,32,27,0.5)',
    chartTrack: '#E3E8E3',
    tabBar: '#FFFFFF',
    /** Lock screen, onboarding and the hero card: one deep forest surface. */
    heroBase: '#0F5C4A',
    heroGlowA: '#1B7A63',
    heroGlowB: '#0B4A3B',
    heroGlowC: '#2E8C70',
  },
  dark: {
    bg: '#111714',
    surface: '#1A221E',
    surfaceAlt: '#212B26',
    elevated: '#1F2823',
    border: '#2C3832',
    text: '#E8EEEA',
    textMuted: '#A7B3AC',
    textFaint: '#8D9A92',
    primary: '#4CC29B',
    primaryText: '#0B1A15',
    primarySoft: '#1C3A30',
    primaryOnSoft: '#7BD8B8',
    good: '#4CC29B',
    goodSoft: '#173329',
    goodText: '#7BD8B8',
    income: '#8EAEFF',
    incomeSoft: '#1B2647',
    incomeText: '#8EAEFF',
    expense: '#FF8F86',
    expenseSoft: '#3B1C1A',
    expenseText: '#FF8F86',
    warn: '#F2B85B',
    warnSoft: '#3A2C10',
    warnText: '#F2B85B',
    info: '#8EAEFF',
    infoSoft: '#1B2647',
    infoText: '#8EAEFF',
    overlay: 'rgba(0,0,0,0.6)',
    chartTrack: '#2C3832',
    tabBar: '#1A221E',
    heroBase: '#173A30',
    heroGlowA: '#1F4A3D',
    heroGlowB: '#12302A',
    heroGlowC: '#245446',
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

/** Cards sit on the page with a thin sage border, not a shadow. */
export const shadow = (dark: boolean) => ({ borderWidth: 1, borderColor: dark ? palette.dark.border : palette.light.border });

/** Mix a #RRGGBB colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
