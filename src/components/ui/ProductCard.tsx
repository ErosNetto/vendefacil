import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MoneyText, StatusBadge } from '@/components/ui/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { getProductStockHealth } from '@/features/inventory/schemas';
import { getSignedProductImageUrl } from '@/features/products/imageService';
import type { ProductRow } from '@/types/database';

export interface ProductCardProps {
  product: ProductRow;
  categoryName?: string | null;
  onPress: () => void;
}

export function ProductCard({
  product,
  categoryName,
  onPress,
}: ProductCardProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!product.primary_image_path) {
      setSignedUrl(null);
      return;
    }

    getSignedProductImageUrl(product.primary_image_path)
      .then((url) => {
        if (isMounted) {
          setSignedUrl(url);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSignedUrl(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [product.primary_image_path]);

  const currentStock = Number(product.current_stock_qty ?? 0);
  const stockHealth = getProductStockHealth(product);

  const subtitleParts = [product.brand, categoryName].filter(Boolean);
  const subtitle =
    subtitleParts.length > 0
      ? subtitleParts.join(' • ')
      : product.sku
        ? `SKU: ${product.sku}`
        : 'Sem marca/categoria';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir produto ${product.name}`}
      style={({ pressed }) => [
        styles.container,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.thumbnailBox}>
        {signedUrl ? (
          <Image
            source={{ uri: signedUrl }}
            style={styles.thumbnailImage}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Ionicons
            name="pricetag-outline"
            size={24}
            color={colors.primary}
          />
        )}
      </View>

      <View style={styles.infoColumn}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <View style={styles.priceRow}>
          <MoneyText cents={product.price_cents} size="sm" tone="primary" />
          <Text style={styles.stockText}>
            • Estoque: {currentStock}
          </Text>
        </View>
      </View>

      <View style={styles.rightColumn}>
        {stockHealth === 'archived' ? (
          <StatusBadge label="Arquivado" tone="warning" />
        ) : stockHealth === 'out' ? (
          <StatusBadge label="Sem estoque" tone="error" />
        ) : stockHealth === 'low' ? (
          <StatusBadge label="Estoque baixo" tone="error" />
        ) : stockHealth === 'at_minimum' ? (
          <StatusBadge label="No limite" tone="warning" />
        ) : (
          <StatusBadge label="Ativo" tone="success" />
        )}
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  thumbnailBox: {
    width: 60,
    height: 60,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  infoColumn: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  stockText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rightColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
});
