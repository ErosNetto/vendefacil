import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/constants/theme';

export type ToastTone = 'success' | 'warning' | 'error' | 'info';

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  message?: string;
  durationMs?: number;
}

export interface ToastData {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  durationMs: number;
}

interface ToastContextValue {
  toast: ToastData | null;
  showToast: (input: ToastInput) => void;
  hideToast: () => void;
  isGlobalProvider: boolean;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let globalShowToastListener: ((input: ToastInput) => void) | null = null;

/**
 * Dispara um Toast global a partir de qualquer tela ou serviço.
 */
export function showGlobalToast(input: ToastInput): void {
  if (globalShowToastListener) {
    globalShowToastListener(input);
  }
}

export function useToast() {
  const ctx = useContext(ToastContext);
  const [localToast, setLocalToast] = useState<ToastData | null>(null);

  const localShowToast = useCallback((input: ToastInput) => {
    setLocalToast({
      id: Date.now() + Math.floor(Math.random() * 1000),
      tone: input.tone ?? 'success',
      title: input.title,
      message: input.message,
      durationMs: input.durationMs ?? 3600,
    });
  }, []);

  const localHideToast = useCallback(() => {
    setLocalToast(null);
  }, []);

  if (ctx) {
    return {
      toast: ctx.toast,
      showToast: ctx.showToast,
      hideToast: ctx.hideToast,
    };
  }

  return {
    toast: localToast,
    showToast: localShowToast,
    hideToast: localHideToast,
  };
}

const TONE_CONFIG: Record<
  ToastTone,
  {
    cardBg: string;
    border: string;
    badgeBg: string;
    iconColor: string;
    progressColor: string;
    titleColor: string;
    messageColor: string;
    iconName: keyof typeof Ionicons.glyphMap;
  }
> = {
  success: {
    cardBg: '#FFFFFF',
    border: '#087F5B',
    badgeBg: '#E6F4EF',
    iconColor: '#087F5B',
    progressColor: '#087F5B',
    titleColor: '#111827',
    messageColor: '#374151',
    iconName: 'checkmark-circle',
  },
  warning: {
    cardBg: '#FFFFFF',
    border: '#D97706',
    badgeBg: '#FEF3C7',
    iconColor: '#D97706',
    progressColor: '#F59E0B',
    titleColor: '#111827',
    messageColor: '#4B5563',
    iconName: 'alert-circle',
  },
  error: {
    cardBg: '#FFFFFF',
    border: '#DC2626',
    badgeBg: '#FEE2E2',
    iconColor: '#DC2626',
    progressColor: '#EF4444',
    titleColor: '#111827',
    messageColor: '#4B5563',
    iconName: 'close-circle',
  },
  info: {
    cardBg: '#FFFFFF',
    border: '#0284C7',
    badgeBg: '#E0F2FE',
    iconColor: '#0284C7',
    progressColor: '#0284C7',
    titleColor: '#111827',
    messageColor: '#4B5563',
    iconName: 'information-circle',
  },
};

interface ToastViewportProps {
  toast: ToastData | null;
  onDismiss: () => void;
}

function ToastViewport({ toast, onDismiss }: ToastViewportProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-80)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const progressScaleX = useRef(new Animated.Value(1)).current;
  const isVisibleRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateOut = useCallback(
    (onFinished?: () => void) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -70,
          duration: 170,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.94,
          duration: 170,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isVisibleRef.current = false;
        onDismiss();
        onFinished?.();
      });
    },
    [onDismiss, opacity, scale, translateY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 5 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy < 0) {
            translateY.setValue(gestureState.dy);
          } else {
            translateY.setValue(gestureState.dy * 0.18);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -18 || gestureState.vy < -0.35) {
            animateOut();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 18,
              stiffness: 240,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [animateOut, translateY],
  );

  useEffect(() => {
    if (!toast) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    progressScaleX.setValue(1);

    if (isVisibleRef.current) {
      // Se já havia um toast visível, faz um pulso suave (estilo Sonner/Dynamic Island) sem piscar
      scale.setValue(0.95);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          damping: 14,
          stiffness: 260,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 240,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      isVisibleRef.current = true;
      opacity.setValue(0);
      translateY.setValue(-72);
      scale.setValue(0.92);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 17,
          stiffness: 210,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 15,
          stiffness: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }

    const duration = toast.durationMs ?? 3600;
    Animated.timing(progressScaleX, {
      toValue: 0,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    timerRef.current = setTimeout(() => {
      animateOut();
    }, duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [animateOut, opacity, progressScaleX, scale, toast, translateY]);

  if (!toast) {
    return null;
  }

  const cfg = TONE_CONFIG[toast.tone];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.viewport,
        {
          top: Math.max(insets.top + 8, 16),
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toastCard,
          {
            backgroundColor: cfg.cardBg,
            borderColor: cfg.border,
          },
        ]}
      >
        <View style={styles.contentRow}>
          <View style={[styles.iconBadge, { backgroundColor: cfg.badgeBg }]}>
            <Ionicons name={cfg.iconName} size={22} color={cfg.iconColor} />
          </View>

          <View style={styles.textCol}>
            <Text
              style={[styles.title, { color: cfg.titleColor }]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.08}
            >
              {toast.title}
            </Text>
            {toast.message ? (
              <Text
                style={[styles.message, { color: cfg.messageColor }]}
                numberOfLines={3}
                maxFontSizeMultiplier={1.08}
              >
                {toast.message}
              </Text>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar notificação"
            onPress={() => animateOut()}
            hitSlop={10}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: cfg.progressColor,
                transform: [{ scaleX: progressScaleX }],
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback((input: ToastInput) => {
    setToast({
      id: Date.now() + Math.floor(Math.random() * 1000),
      tone: input.tone ?? 'success',
      title: input.title,
      message: input.message,
      durationMs: input.durationMs ?? 3600,
    });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    globalShowToastListener = showToast;
    return () => {
      if (globalShowToastListener === showToast) {
        globalShowToastListener = null;
      }
    };
  }, [showToast]);

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      toast,
      showToast,
      hideToast,
      isGlobalProvider: true,
    }),
    [hideToast, showToast, toast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastViewport toast={toast} onDismiss={hideToast} />
    </ToastContext.Provider>
  );
}

export interface ToastOverlayProps {
  toast: ToastData | null;
  onDismiss: () => void;
}

/**
 * Mantido por compatibilidade com telas que renderizavam `<ToastOverlay>` localmente.
 * Quando o `ToastProvider` global está ativo na raiz (`_layout.tsx`), evita duplicação.
 */
export function ToastOverlay({ toast, onDismiss }: ToastOverlayProps) {
  const ctx = useContext(ToastContext);
  if (ctx?.isGlobalProvider) {
    return null;
  }
  return <ToastViewport toast={toast} onDismiss={onDismiss} />;
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 99999,
    alignItems: 'center',
  },
  toastCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#0B1713',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
  },
  message: {
    ...typography.caption,
    fontSize: 12.5,
    lineHeight: 17,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  progressTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '100%',
  },
});
