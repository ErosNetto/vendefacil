import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';
import { formatCentsToBRL } from '@/utils/formatters';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

const TONE_MAP: Record<
  StatusTone,
  { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  success: {
    bg: colors.successSoft,
    fg: colors.success,
    icon: 'checkmark-circle-outline',
  },
  warning: {
    bg: colors.warningSoft,
    fg: colors.warning,
    icon: 'time-outline',
  },
  error: {
    bg: colors.errorSoft,
    fg: colors.error,
    icon: 'alert-circle-outline',
  },
  info: {
    bg: colors.infoSoft,
    fg: colors.info,
    icon: 'information-circle-outline',
  },
  neutral: {
    bg: colors.primarySoft,
    fg: colors.primaryDark,
    icon: 'shield-checkmark-outline',
  },
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const palette = TONE_MAP[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Ionicons name={palette.icon} size={14} color={palette.fg} />
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export interface MoneyTextProps {
  cents: number;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'primary' | 'error' | 'warning';
  style?: TextStyle;
}

export function MoneyText({
  cents,
  size = 'md',
  tone = 'default',
  style,
}: MoneyTextProps) {
  const colorMap = {
    default: colors.text,
    primary: colors.primary,
    error: colors.error,
    warning: colors.warning,
  } as const;

  const sizeStyle =
    size === 'lg'
      ? typography.sectionLg
      : size === 'sm'
        ? typography.bodyStrong
        : typography.section;

  return (
    <Text style={[sizeStyle, { color: colorMap[tone] }, style]}>
      {formatCentsToBRL(cents)}
    </Text>
  );
}

export interface MetricCardProps {
  title: string;
  cents: number;
  subtitle?: string;
  tone?: 'default' | 'primary' | 'error' | 'warning';
  iconName: keyof typeof Ionicons.glyphMap;
}

export function MetricCard({
  title,
  cents,
  subtitle,
  tone = 'default',
  iconName,
}: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricTitle}>{title}</Text>
        <View style={styles.metricIconBadge}>
          <Ionicons name={iconName} size={18} color={colors.primary} />
        </View>
      </View>
      <MoneyText cents={cents} size="lg" tone={tone} />
      {subtitle ? <Text style={styles.metricSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  metricCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  metricTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metricIconBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
