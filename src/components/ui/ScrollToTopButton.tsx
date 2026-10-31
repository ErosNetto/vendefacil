import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/constants/theme';

export interface ScrollableMethods {
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
}

export interface UseScrollToTopResult<T extends ScrollableMethods> {
  scrollRef: React.RefObject<T | null>;
  showScrollToTop: boolean;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollToTop: () => void;
}

export function useScrollToTop<T extends ScrollableMethods>(
  threshold = 260,
): UseScrollToTopResult<T> {
  const scrollRef = useRef<T | null>(null);
  const isAutoScrollingRef = useRef<boolean>(false);
  const autoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;

      if (isAutoScrollingRef.current) {
        if (y <= 20) {
          isAutoScrollingRef.current = false;
          if (autoScrollTimeoutRef.current) {
            clearTimeout(autoScrollTimeoutRef.current);
            autoScrollTimeoutRef.current = null;
          }
        }
        return;
      }

      const shouldShow = y > threshold;
      setShowScrollToTop((prev) => (prev === shouldShow ? prev : shouldShow));
    },
    [threshold],
  );

  const scrollToTop = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    isAutoScrollingRef.current = true;
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }
    autoScrollTimeoutRef.current = setTimeout(() => {
      isAutoScrollingRef.current = false;
      autoScrollTimeoutRef.current = null;
    }, 800);

    setShowScrollToTop(false);

    if (typeof node.scrollToOffset === 'function') {
      node.scrollToOffset({ offset: 0, animated: true });
    } else if (typeof node.scrollTo === 'function') {
      node.scrollTo({ y: 0, animated: true });
    }
  }, []);

  return {
    scrollRef,
    showScrollToTop,
    handleScroll,
    scrollToTop,
  };
}

export interface ScrollToTopButtonProps {
  visible: boolean;
  onPress?: () => void;
}

export function ScrollToTopButton({
  visible,
  onPress,
}: ScrollToTopButtonProps) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isTabScreen = segments[0] === '(tabs)';
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.stopAnimation();
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 200 : 150,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, visible]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  // Em telas sem barra de abas inferior (ex: Nova Venda), adiciona folga extra acima da barra do celular
  const bottomOffset = isTabScreen
    ? spacing.lg
    : spacing.xxl + Math.max(insets.bottom, spacing.md);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          opacity: anim,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar ao topo da tela"
        accessibilityHint="Rola a tela de volta para o início"
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          pressed ? styles.buttonPressed : null,
        ]}
      >
        <Ionicons name="arrow-up" size={22} color={colors.white} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 50,
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonPressed: {
    backgroundColor: colors.primaryDark,
  },
});
