import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/constants/theme';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
}

export function AppHeader({ title, subtitle, rightSlot }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    ...typography.sectionLg,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  rightSlot: {
    flexShrink: 0,
  },
});
