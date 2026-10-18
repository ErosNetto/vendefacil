import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

export interface ScreenScrollContextValue {
  ensureVisibleOnFocus: (targetView: View | null) => void;
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
}

export function Screen({
  children,
  scroll = true,
  keyboardAvoiding = true,
  contentContainerStyle,
  backgroundColor = colors.background,
}: ScreenProps) {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsetYRef = useRef<number>(0);
  const keyboardHeightRef = useRef<number>(0);
  const focusedViewRef = useRef<View | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  const scrollTargetIntoView = useCallback((targetView: View | null) => {
    if (!targetView || !scrollViewRef.current) {
      return;
    }

    targetView.measureInWindow((_x, y, _width, height) => {
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
    (targetView: View | null) => {
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
      scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  const contextValue = useMemo<ScreenScrollContextValue>(
    () => ({ ensureVisibleOnFocus }),
    [ensureVisibleOnFocus],
  );

  const dynamicBottomPadding =
    keyboardHeight > 0 ? keyboardHeight + spacing.xxxl * 2 : spacing.xxxl;

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

  return (
    <ScreenScrollContext.Provider value={contextValue}>
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor }]}
        edges={['top', 'left', 'right']}
      >
        {keyboardAvoiding && Platform.OS === 'ios' ? (
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            {inner}
          </KeyboardAvoidingView>
        ) : (
          inner
        )}
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
