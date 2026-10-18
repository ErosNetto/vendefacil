import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { useScreenScroll } from '@/components/ui/Screen';
import { colors, radius, spacing, touchTarget, typography } from '@/constants/theme';

export interface FormFieldProps extends TextInputProps {
  label: string;
  errorMessage?: string | null;
  helperText?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
}

export function FormField({
  label,
  errorMessage,
  helperText,
  leftIcon,
  isPassword = false,
  style,
  onFocus,
  ...inputProps
}: FormFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const wrapperRef = useRef<View | null>(null);
  const { ensureVisibleOnFocus } = useScreenScroll();
  const hasError = Boolean(errorMessage);

  return (
    <View ref={wrapperRef} collapsable={false} style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputContainer, hasError ? styles.inputError : null]}>
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={18}
            color={hasError ? colors.error : colors.textSecondary}
            style={styles.leftIcon}
          />
        ) : null}
        <TextInput
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={label}
          secureTextEntry={isPassword && !passwordVisible}
          style={[styles.input, style]}
          onFocus={(event) => {
            ensureVisibleOnFocus(wrapperRef.current);
            onFocus?.(event);
          }}
          {...inputProps}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setPasswordVisible((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            style={styles.eyeButton}
            hitSlop={8}
          >
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {hasError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.error} />
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    minHeight: touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  leftIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.bodyLg,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  eyeButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
