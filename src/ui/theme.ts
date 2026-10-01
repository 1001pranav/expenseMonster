import { useColorScheme } from 'react-native';
import { useStore } from '@/db/store';

const palette = {
  light: {
    bg: '#F6F5FB',
    surface: '#FFFFFF',
    surfaceAlt: '#EFEDF8',
    elevated: '#FFFFFF',
    border: '#E5E2F0',
    text: '#17123A',
    textMuted: '#5E5980',
    textFaint: '#9A96B4',
    primary: '#5B3DF5',
    primaryText: '#FFFFFF',
    primarySoft: '#ECE8FF',
    income: '#0B9F6E',
    incomeSoft: '#DCF6EC',
    expense: '#EE3F5B',
    expenseSoft: '#FFE6EA',
    warn: '#D97706',
    warnSoft: '#FEF0D7',
    info: '#0284C7',
    infoSoft: '#DCEFFB',
    overlay: 'rgba(23,18,58,0.5)',
    chartTrack: '#ECEAF5',
    tabBar: 'rgba(255,255,255,0.97)',
    /** Aurora hero: deep ink lit by violet, rose and marigold glows. */
    heroBase: '#1B1448',
    heroGlowA: '#7B5CFF',
    heroGlowB: '#FF4F8B',
    heroGlowC: '#FFB23F',
  },
  dark: {
    bg: '#0B0920',
    surface: '#15122E',
    surfaceAlt: '#1F1B3E',
    elevated: '#1B1838',
    border: '#2A2551',
    text: '#F4F2FF',
    textMuted: '#A9A4CB',
    textFaint: '#6D6894',
    primary: '#7A68FF',
    primaryText: '#FFFFFF',
    primarySoft: '#272061',
    income: '#34D399',
    incomeSoft: '#0F2E25',
    expense: '#FF6A82',
    expenseSoft: '#3A1622',
    warn: '#FBBF24',
    warnSoft: '#3A2C0C',
    info: '#38BDF8',
    infoSoft: '#0E2A3A',
    overlay: 'rgba(0,0,0,0.62)',
    chartTrack: '#24204A',
    tabBar: 'rgba(21,18,46,0.98)',
    heroBase: '#1C1550',
    heroGlowA: '#7B5CFF',
    heroGlowB: '#FF4F8B',
    heroGlowC: '#FFB23F',
  },
};

/** Two-stop gradients for tiles and buttons. Same in both themes: they sit on white icons. */
export const gradients = {
  brand: ['#7B5CFF', '#5B3DF5'],
  violet: ['#9B7BFF', '#5B3DF5'],
  sunset: ['#FFB23F', '#FF5C6C'],
  rose: ['#FF7EB3', '#E8337A'],
  mint: ['#34E0B4', '#0B9F6E'],
  ocean: ['#4CC9FF', '#4F5BEF'],
  marigold: ['#FFD24A', '#F08C00'],
  ink: ['#4B4470', '#221C4A'],
} as const;
export type GradientName = keyof typeof gradients;

export type Colors = typeof palette.light;

export const space = (n: number) => n * 8;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  /** Sora: geometric display face for headings and hero figures. */
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
};

export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 42, letterSpacing: -1 },
  h1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 27, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
} as const;
export type TypeVariant = keyof typeof type;

export function useTheme() {
  const system = useColorScheme();
  const pref = useStore((s) => s.settings.theme);
  const scheme = pref === 'system' ? (system ?? 'light') : pref;
  const colors = palette[scheme === 'dark' ? 'dark' : 'light'];
  return { colors, scheme, dark: scheme === 'dark' };
}

export const shadow = (dark: boolean) =>
  dark
    ? { borderWidth: 1, borderColor: palette.dark.border }
    : { shadowColor: '#2A1F7A', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2 };

/** Mix a #RRGGBB colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
