import { useSegments } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaView,
  type Edge,
} from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

import { ScrollToTopButton } from './ScrollToTopButton';

type ViewRef = ComponentRef<typeof View>;
type ScrollViewRef = ComponentRef<typeof ScrollView>;

export interface ScreenScrollContextValue {
  ensureVisibleOnFocus: (targetView: ViewRef | null) => void;
}

const ScreenScrollContext = createContext<ScreenScrollContextValue>({
  ensureVisibleOnFocus: () => {},
});

export function useScreenScroll(): ScreenScrollContextValue {
  return useContext(ScreenScrollContext);
}

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  keyboardAvoiding?: boolean;
  contentContainerStyle?: ViewStyle;
  backgroundColor?: string;
  showScrollToTop?: boolean;
  onScrollToTop?: () => void;
}

export function Screen({
  children,
  scroll = true,
  keyboardAvoiding = true,
  contentContainerStyle,
  backgroundColor = colors.background,
  showScrollToTop,
  onScrollToTop,
}: ScreenProps) {
  const segments = useSegments();
  const isTabScreen = segments[0] === '(tabs)';
  const scrollViewRef = useRef<ScrollViewRef>(null);
  const scrollOffsetYRef = useRef<number>(0);
  const isAutoScrollingRef = useRef<boolean>(false);
  const autoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const keyboardHeightRef = useRef<number>(0);
  const focusedViewRef = useRef<ViewRef | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
  const [isScrolledDown, setIsScrolledDown] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, []);

  const scrollTargetIntoView = useCallback((targetView: ViewRef | null) => {
    if (!targetView || !scrollViewRef.current) {
      return;
    }

    targetView.measureInWindow((_x: number, y: number, _width: number, height: number) => {
      if (!height || Number.isNaN(y)) {
        return;
      }

      const windowHeight = Dimensions.get('window').height;
      const estimatedKb =
        keyboardHeightRef.current > 0
          ? keyboardHeightRef.current
          : Math.round(windowHeight * 0.42);
      const visibleBottomLimit = windowHeight - estimatedKb - 28;
      const fieldBottom = y + height;

      if (fieldBottom > visibleBottomLimit) {
        const scrollDelta = fieldBottom - visibleBottomLimit + 36;
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, scrollOffsetYRef.current + scrollDelta),
          animated: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = event.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = nextHeight;
      setKeyboardHeight(nextHeight);
      if (focusedViewRef.current) {
        setTimeout(() => {
          scrollTargetIntoView(focusedViewRef.current);
        }, 60);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollTargetIntoView]);

  const ensureVisibleOnFocus = useCallback(
    (targetView: ViewRef | null) => {
      focusedViewRef.current = targetView;
      setTimeout(() => {
        scrollTargetIntoView(targetView);
      }, 120);
      setTimeout(() => {
        scrollTargetIntoView(targetView);
      }, 300);
    },
    [scrollTargetIntoView],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      scrollOffsetYRef.current = y;

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

      const nextScrolled = y > 260;
      setIsScrolledDown((prev) => (prev === nextScrolled ? prev : nextScrolled));
    },
    [],
  );

  const handleInternalScrollToTop = useCallback(() => {
    isAutoScrollingRef.current = true;
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }
    autoScrollTimeoutRef.current = setTimeout(() => {
      isAutoScrollingRef.current = false;
      autoScrollTimeoutRef.current = null;
    }, 800);

    setIsScrolledDown(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const contextValue = useMemo<ScreenScrollContextValue>(
    () => ({ ensureVisibleOnFocus }),
    [ensureVisibleOnFocus],
  );

  const baseBottomPadding = isTabScreen ? spacing.xxxl : spacing.xxxl * 2;
  const dynamicBottomPadding =
    keyboardHeight > 0 ? keyboardHeight + spacing.xxxl * 2 : baseBottomPadding;

  const safeEdges: Edge[] = isTabScreen
    ? ['top', 'left', 'right']
    : ['top', 'bottom', 'left', 'right'];

  const inner = scroll ? (
    <ScrollView
      ref={scrollViewRef}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: dynamicBottomPadding },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.staticContent, contentContainerStyle]}>{children}</View>
  );

  const isScrollButtonVisible =
    keyboardHeight === 0 && (scroll ? isScrolledDown : Boolean(showScrollToTop));

  return (
    <ScreenScrollContext.Provider value={contextValue}>
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor }]}
        edges={safeEdges}
      >
        {keyboardAvoiding && Platform.OS === 'ios' ? (
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            {inner}
          </KeyboardAvoidingView>
        ) : (
          inner
        )}
        <ScrollToTopButton
          visible={isScrollButtonVisible}
          onPress={scroll ? handleInternalScrollToTop : onScrollToTop}
        />
      </SafeAreaView>
    </ScreenScrollContext.Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
