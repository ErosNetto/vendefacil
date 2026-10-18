/**
 * Tokens oficiais do Design System VendeFácil
 * Especificação: docs/04-design-system.md
 */

export const colors = {
  primary: '#087F5B',
  primaryDark: '#075B43',
  primarySoft: '#E7F6EF',
  background: '#F5F7F6',
  surface: '#FFFFFF',
  text: '#17211D',
  textSecondary: '#64716B',
  border: '#E1E8E4',
  success: '#16804A',
  successSoft: '#E8F6EE',
  warning: '#B7791F',
  warningSoft: '#FEF6E7',
  error: '#C0392B',
  errorSoft: '#FDEDEB',
  info: '#2563EB',
  infoSoft: '#EFF6FF',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  control: 12,
  controlLg: 14,
  card: 16,
  cardLg: 20,
  pill: 999,
} as const;

export const typography = {
  titleLg: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  sectionLg: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
  },
  section: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  bodyLg: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
  },
} as const;

export const touchTarget = {
  minHeight: 48,
  minWidth: 48,
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  touchTarget,
} as const;
