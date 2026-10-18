import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, touchTarget, typography } from '@/constants/theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  iconName,
  style,
  accessibilityHint,
}: ButtonProps) {
  const isInactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles.primary,
        pressed && !isInactive ? styles.primaryPressed : null,
        isInactive ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <View style={styles.row}>
          {iconName ? <Ionicons name={iconName} size={18} color={colors.white} /> : null}
          <Text style={styles.primaryLabel}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  iconName,
  style,
  accessibilityHint,
}: ButtonProps) {
  const isInactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles.secondary,
        pressed && !isInactive ? styles.secondaryPressed : null,
        isInactive ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <View style={styles.row}>
          {iconName ? <Ionicons name={iconName} size={18} color={colors.primary} /> : null}
          <Text style={styles.secondaryLabel}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minHeight,
    borderRadius: radius.controlLg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryPressed: {
    backgroundColor: colors.primaryDark,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryPressed: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  disabled: {
    opacity: 0.55,
  },
  primaryLabel: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.white,
  },
  secondaryLabel: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.text,
  },
});
