import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/constants/theme';

export type ToastTone = 'success' | 'warning' | 'error' | 'info';

export interface ToastData {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  durationMs?: number;
}

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback(
    (input: {
      tone?: ToastTone;
      title: string;
      message?: string;
      durationMs?: number;
    }) => {
      setToast({
        id: Date.now(),
        tone: input.tone ?? 'success',
        title: input.title,
        message: input.message,
        durationMs: input.durationMs ?? 3500,
      });
    },
    [],
  );

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    toast,
    showToast,
    hideToast,
  };
}

export interface ToastOverlayProps {
  toast: ToastData | null;
  onDismiss: () => void;
}

const TONE_CONFIG: Record<
  ToastTone,
  {
    bg: string;
    border: string;
    iconColor: string;
    titleColor: string;
    messageColor: string;
    iconName: keyof typeof Ionicons.glyphMap;
  }
> = {
  success: {
    bg: '#087F5B',
    border: '#066046',
    iconColor: '#FFFFFF',
    titleColor: '#FFFFFF',
    messageColor: 'rgba(255, 255, 255, 0.9)',
    iconName: 'checkmark-circle',
  },
  warning: {
    bg: '#FFF4E6',
    border: '#D97706',
    iconColor: '#B45309',
    titleColor: '#92400E',
    messageColor: '#78350F',
    iconName: 'alert-circle',
  },
  error: {
    bg: '#FFF5F5',
    border: '#E03131',
    iconColor: '#C92A2A',
    titleColor: '#C92A2A',
    messageColor: '#7F1D1D',
    iconName: 'close-circle',
  },
  info: {
    bg: colors.surface,
    border: colors.primary,
    iconColor: colors.primaryDark,
    titleColor: colors.text,
    messageColor: colors.textSecondary,
    iconName: 'information-circle',
  },
};

export function ToastOverlay({ toast, onDismiss }: ToastOverlayProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;

  useEffect(() => {
    if (!toast) {
      return;
    }

    opacity.setValue(0);
    translateY.setValue(-24);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 16,
        stiffness: 180,
        useNativeDriver: true,
      }),
    ]).start();

    const duration = toast.durationMs ?? 3500;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -20,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onDismiss();
      });
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [onDismiss, opacity, toast, translateY]);

  if (!toast) {
    return null;
  }

  const cfg = TONE_CONFIG[toast.tone];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: Math.max(insets.top + spacing.sm, spacing.lg),
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        accessibilityRole="alert"
        style={[
          styles.toastCard,
          {
            backgroundColor: cfg.bg,
            borderColor: cfg.border,
          },
        ]}
      >
        <Ionicons name={cfg.iconName} size={22} color={cfg.iconColor} />
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: cfg.titleColor }]}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text style={[styles.message, { color: cfg.messageColor }]}>
              {toast.message}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar notificação"
          onPress={onDismiss}
          hitSlop={8}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={18} color={cfg.iconColor} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastCard: {
    width: '100%',
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
  },
  message: {
    ...typography.caption,
  },
  closeBtn: {
    padding: 4,
  },
});
