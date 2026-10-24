import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';

export interface ListCounterBannerProps {
  totalCount: number;
  displayedCount: number;
  nounSingular: string;
  nounPlural: string;
  isFiltered?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListCounterBanner({
  totalCount,
  displayedCount,
  nounSingular,
  nounPlural,
  isFiltered = false,
  style,
}: ListCounterBannerProps) {
  if (totalCount === 0 && displayedCount === 0) {
    return null;
  }

  const noun = totalCount === 1 ? nounSingular : nounPlural;

  let message: string;
  if (isFiltered) {
    message = `${displayedCount} de ${totalCount} ${noun} ${displayedCount === 1 ? 'encontrado' : 'encontrados'}`;
  } else if (displayedCount < totalCount) {
    message = `Exibindo ${displayedCount} de ${totalCount} ${noun}`;
  } else {
    message = `Total de ${totalCount} ${noun}`;
  }

  return (
    <View style={[styles.counterContainer, style]} accessibilityRole="text">
      <View style={styles.counterPill}>
        <Ionicons
          name="layers-outline"
          size={14}
          color={colors.primary}
          style={styles.counterIcon}
        />
        <Text style={styles.counterText}>{message}</Text>
      </View>
    </View>
  );
}

export interface ListFooterLoaderProps {
  isLoadingMore: boolean;
  hasMore: boolean;
  itemCount: number;
  nounSingular?: string;
  nounPlural?: string;
  onPressLoadMore?: () => void;
}

export function ListFooterLoader({
  isLoadingMore,
  hasMore,
  itemCount,
  nounSingular = 'item',
  nounPlural = 'itens',
  onPressLoadMore,
}: ListFooterLoaderProps) {
  if (itemCount === 0) {
    return null;
  }

  const noun = itemCount === 1 ? nounSingular : nounPlural;

  if (isLoadingMore) {
    return (
      <View style={styles.footerLoading} accessibilityRole="progressbar">
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.footerText}>Carregando mais {nounPlural}...</Text>
      </View>
    );
  }

  if (hasMore) {
    if (onPressLoadMore) {
      return (
        <View style={styles.footerLoadMoreBox}>
          <Pressable
            accessibilityRole="button"
            onPress={onPressLoadMore}
            style={styles.loadMoreButton}
          >
            <Ionicons name="arrow-down-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.loadMoreText}>Carregar mais {nounPlural}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.footerText}>Buscando mais {nounPlural}...</Text>
      </View>
    );
  }

  return (
    <View style={styles.footerEnd}>
      <View style={styles.footerDivider} />
      <Text style={styles.footerEndText}>
        Fim da lista • {itemCount} {noun}
      </Text>
      <View style={styles.footerDivider} />
    </View>
  );
}

const styles = StyleSheet.create({
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  counterIcon: {
    marginRight: spacing.xs,
  },
  counterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  footerLoading: {
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footerEnd: {
    paddingVertical: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  footerDivider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  footerEndText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footerLoadMoreBox: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
});
