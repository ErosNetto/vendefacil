import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, typography } from '@/constants/theme';

export interface PeriodOption<T extends string> {
  key: T;
  label: string;
}

export interface PeriodSegmentedControlProps<T extends string> {
  options: readonly PeriodOption<T>[];
  selectedKey: T;
  onSelect: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function PeriodSegmentedControl<T extends string>({
  options,
  selectedKey,
  onSelect,
  style,
}: PeriodSegmentedControlProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map((opt) => {
        const isSelected = opt.key === selectedKey;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={opt.label}
            onPress={() => onSelect(opt.key)}
            style={[styles.tab, isSelected ? styles.tabSelected : null]}
          >
            <Text
              style={[
                styles.tabText,
                isSelected ? styles.tabTextSelected : null,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    width: '100%',
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: 'transparent',
  },
  tabSelected: {
    backgroundColor: colors.primarySoft,
  },
  tabText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tabTextSelected: {
    ...typography.bodyStrong,
    fontSize: 13,
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
