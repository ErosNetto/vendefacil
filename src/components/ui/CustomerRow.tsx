import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { getCustomerInitials } from '@/features/customers/schemas';
import type { CustomerRow as CustomerRecord } from '@/types/database';

export interface CustomerRowProps {
  customer: CustomerRecord;
  onPress: () => void;
}

export const CustomerRow = memo(function CustomerRow({
  customer,
  onPress,
}: CustomerRowProps) {
  const initials = getCustomerInitials(customer.full_name);
  const secondaryLine =
    customer.phone || customer.email || 'Sem telefone ou e-mail informado';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ficha de ${customer.full_name}`}
      style={({ pressed }) => [
        styles.container,
        pressed ? styles.pressed : null,
      ]}
    >
      <View
        style={[
          styles.avatar,
          customer.is_archived ? styles.avatarArchived : null,
        ]}
      >
        <Text
          style={[
            styles.avatarText,
            customer.is_archived ? styles.avatarTextArchived : null,
          ]}
        >
          {initials}
        </Text>
      </View>

      <View style={styles.infoColumn}>
        <Text style={styles.name} numberOfLines={1}>
          {customer.full_name}
        </Text>
        <Text style={styles.secondary} numberOfLines={1}>
          {secondaryLine}
        </Text>
      </View>

      <View style={styles.rightColumn}>
        <StatusBadge
          label={customer.is_archived ? 'Arquivado' : 'Ativo'}
          tone={customer.is_archived ? 'warning' : 'success'}
        />
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarArchived: {
    backgroundColor: colors.warningSoft,
  },
  avatarText: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  avatarTextArchived: {
    color: colors.warning,
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
  secondary: {
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
