import { useColorScheme } from 'react-native';
import { useStore } from '@/db/store';

const palette = {
  light: {
    bg: '#F6F6FB',
    surface: '#FFFFFF',
    surfaceAlt: '#EEEEF7',
    elevated: '#FFFFFF',
    border: '#E3E3EE',
    text: '#14142B',
    textMuted: '#5E5E7A',
    textFaint: '#9A9AB0',
    primary: '#4F46E5',
    primaryText: '#FFFFFF',
    primarySoft: '#E8E7FD',
    income: '#0F9D58',
    incomeSoft: '#DDF5E8',
    expense: '#E5484D',
    expenseSoft: '#FDE4E4',
    warn: '#D97706',
    warnSoft: '#FEF0D7',
    info: '#0284C7',
    infoSoft: '#DCEFFB',
    overlay: 'rgba(20,20,43,0.45)',
    chartTrack: '#ECECF4',
    tabBar: 'rgba(255,255,255,0.96)',
  },
  dark: {
    bg: '#0B0B14',
    surface: '#161624',
    surfaceAlt: '#1F1F31',
    elevated: '#1C1C2C',
    border: '#2A2A40',
    text: '#F2F2FA',
    textMuted: '#A5A5BF',
    textFaint: '#6C6C88',
    primary: '#8B85FF',
    primaryText: '#0B0B14',
    primarySoft: '#26244D',
    income: '#3DD68C',
    incomeSoft: '#12301F',
    expense: '#FF6B6F',
    expenseSoft: '#3A1719',
    warn: '#FBBF24',
    warnSoft: '#3A2C0C',
    info: '#38BDF8',
    infoSoft: '#0E2A3A',
    overlay: 'rgba(0,0,0,0.6)',
    chartTrack: '#24243A',
    tabBar: 'rgba(22,22,36,0.97)',
  },
};

export type Colors = typeof palette.light;

export const space = (n: number) => n * 8;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
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
    : { shadowColor: '#14142B', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 };
