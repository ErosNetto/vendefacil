import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SearchField } from '@/components/ui/SearchAndFilters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { getCustomerInitials } from '@/features/customers/schemas';
import type { CustomerRow } from '@/types/database';

export interface CustomerPickerModalProps {
  visible: boolean;
  onClose: () => void;
  customers: CustomerRow[];
  selectedCustomerId: string | null;
  onSelectCustomer: (customer: CustomerRow | null) => void;
  onAddNewCustomer?: () => void;
  title?: string;
}

export function CustomerPickerModal({
  visible,
  onClose,
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onAddNewCustomer,
  title = 'Selecionar cliente',
}: CustomerPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return customers;
    }
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)),
    );
  }, [customers, searchQuery]);

  const activeCustomerCount = customers.length;

  function handleSelect(customer: CustomerRow | null): void {
    onSelectCustomer(customer);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel="Fechar modal"
        />

        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerTitleCol}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Text style={styles.sheetSubtitle}>
                {activeCustomerCount === 1
                  ? '1 cliente cadastrado'
                  : `${activeCustomerCount} clientes cadastrados`}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Campo de Busca */}
          <SearchField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por nome, telefone ou e-mail..."
            accessibilityLabel="Buscar cliente no modal"
          />

          {/* Lista de Opções */}
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Venda avulsa sem cliente"
                onPress={() => handleSelect(null)}
                style={[
                  styles.optionCard,
                  selectedCustomerId === null ? styles.optionCardSelected : null,
                ]}
              >
                <View style={[styles.avatarCircle, styles.walkInAvatar]}>
                  <Ionicons
                    name="storefront-outline"
                    size={20}
                    color={colors.primaryDark}
                  />
                </View>

                <View style={styles.optionInfoCol}>
                  <Text style={styles.optionName}>
                    Venda avulsa (Balcão)
                  </Text>
                  <Text style={styles.optionSub}>
                    Não vincular a nenhum cliente específico
                  </Text>
                </View>

                {selectedCustomerId === null ? (
                  <View style={styles.checkBadge}>
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={colors.white}
                    />
                  </View>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textSecondary}
                  />
                )}
              </Pressable>
            }
            renderItem={({ item }) => {
              const isSelected = item.id === selectedCustomerId;
              const initials = getCustomerInitials(item.full_name);
              const secondary =
                item.phone || item.email || 'Sem telefone informado';

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar ${item.full_name}`}
                  onPress={() => handleSelect(item)}
                  style={[
                    styles.optionCard,
                    isSelected ? styles.optionCardSelected : null,
                  ]}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.optionInfoCol}>
                    <Text style={styles.optionName} numberOfLines={1}>
                      {item.full_name}
                    </Text>
                    <Text style={styles.optionSub} numberOfLines={1}>
                      {secondary}
                    </Text>
                  </View>

                  {isSelected ? (
                    <View style={styles.checkBadge}>
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={colors.white}
                      />
                    </View>
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.textSecondary}
                    />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="people-outline"
                  size={36}
                  color={colors.textSecondary}
                />
                <Text style={styles.emptyTitle}>Nenhum cliente encontrado</Text>
                <Text style={styles.emptySub}>
                  Verifique o termo buscado ou cadastre um novo cliente.
                </Text>
              </View>
            }
          />

          {/* Rodapé: Atalho para cadastrar novo cliente */}
          {onAddNewCustomer ? (
            <View style={styles.sheetFooter}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onAddNewCustomer();
                }}
                style={styles.newCustomerButton}
              >
                <Ionicons
                  name="person-add-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.newCustomerButtonText}>
                  Cadastrar novo cliente
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitleCol: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    ...typography.section,
    color: colors.text,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walkInAvatar: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  optionInfoCol: {
    flex: 1,
    gap: 2,
  },
  optionName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  optionSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
  },
  emptySub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheetFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  newCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  newCustomerButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
});
