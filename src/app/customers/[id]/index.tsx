import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { getCustomerInitials } from '@/features/customers/schemas';
import {
  getWorkspaceCustomerById,
  mapCustomerServiceError,
  setWorkspaceCustomerArchived,
} from '@/features/customers/services';
import type { CustomerRow } from '@/types/database';
import { formatDateBR } from '@/utils/formatters';

export default function CustomerDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmArchiveVisible, setConfirmArchiveVisible] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const loadCustomer = useCallback(async () => {
    if (!workspaceId || !id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const record = await getWorkspaceCustomerById(workspaceId, id);
      if (!record) {
        setErrorMessage('Cliente não encontrado neste espaço de trabalho.');
      } else {
        setCustomer(record);
      }
    } catch (error) {
      setErrorMessage(mapCustomerServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [id, workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomer();
    }, [loadCustomer]),
  );

  async function handleToggleArchive(): Promise<void> {
    if (!workspaceId || !customer || isArchiving) {
      return;
    }

    setIsArchiving(true);
    try {
      const updated = await setWorkspaceCustomerArchived(
        workspaceId,
        customer.id,
        !customer.is_archived,
      );
      setCustomer(updated);
      setConfirmArchiveVisible(false);
    } catch (error) {
      setConfirmArchiveVisible(false);
      setErrorMessage(mapCustomerServiceError(error));
    } finally {
      setIsArchiving(false);
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Carregando ficha do cliente..." />
      </Screen>
    );
  }

  if (errorMessage || !customer) {
    return (
      <Screen>
        <ErrorState
          title="Não foi possível abrir a ficha"
          message={errorMessage ?? 'Cliente não localizado.'}
          onRetry={() => {
            void loadCustomer();
          }}
        />
      </Screen>
    );
  }

  const initials = getCustomerInitials(customer.full_name);

  return (
    <Screen>
      <AppHeader
        title="Ficha do cliente"
        subtitle={`Cliente desde ${formatDateBR(customer.created_at)}`}
        showBack
      />

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View
            style={[
              styles.avatarLarge,
              customer.is_archived ? styles.avatarArchived : null,
            ]}
          >
            <Text
              style={[
                styles.avatarLargeText,
                customer.is_archived ? styles.avatarTextArchived : null,
              ]}
            >
              {initials}
            </Text>
          </View>
          <View style={styles.profileTitleCol}>
            <Text style={styles.customerName}>{customer.full_name}</Text>
            <StatusBadge
              label={customer.is_archived ? 'Cliente arquivado' : 'Cliente ativo'}
              tone={customer.is_archived ? 'warning' : 'success'}
            />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={18} color={colors.textSecondary} />
          <View style={styles.detailTextCol}>
            <Text style={styles.detailLabel}>Telefone / WhatsApp</Text>
            <Text style={styles.detailValue}>
              {customer.phone ?? 'Não informado'}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
          <View style={styles.detailTextCol}>
            <Text style={styles.detailLabel}>E-mail</Text>
            <Text style={styles.detailValue}>
              {customer.email ?? 'Não informado'}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons
            name="location-outline"
            size={18}
            color={colors.textSecondary}
          />
          <View style={styles.detailTextCol}>
            <Text style={styles.detailLabel}>Endereço</Text>
            <Text style={styles.detailValue}>
              {customer.address ?? 'Não informado'}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons
            name="document-text-outline"
            size={18}
            color={colors.textSecondary}
          />
          <View style={styles.detailTextCol}>
            <Text style={styles.detailLabel}>Observações</Text>
            <Text style={styles.detailValue}>
              {customer.notes ?? 'Nenhuma observação registrada.'}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <PrimaryButton
            label="Editar dados"
            iconName="create-outline"
            onPress={() => router.push(`/customers/${customer.id}/edit`)}
          />
          <SecondaryButton
            label={
              customer.is_archived ? 'Restaurar cliente' : 'Arquivar cliente'
            }
            iconName={
              customer.is_archived
                ? 'refresh-circle-outline'
                : 'archive-outline'
            }
            onPress={() => setConfirmArchiveVisible(true)}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Resumo financeiro do cliente</Text>
      <View style={styles.metricsGrid}>
        <MetricCard
          title="Total comprado"
          cents={0}
          subtitle="0 vendas confirmadas"
          tone="default"
          iconName="bag-check-outline"
        />
        <MetricCard
          title="Total pago"
          cents={0}
          subtitle="0 recebimentos"
          tone="primary"
          iconName="cash-outline"
        />
        <MetricCard
          title="Saldo em aberto"
          cents={0}
          subtitle="0 parcelas pendentes"
          tone="warning"
          iconName="time-outline"
        />
      </View>

      <Text style={styles.sectionTitle}>
        Histórico de vendas, parcelas e recebimentos
      </Text>
      <EmptyState
        iconName="receipt-outline"
        title="Nenhuma movimentação comercial com este cliente"
        description="As vendas, parcelas e pagamentos vinculados a este cliente aparecerão automaticamente nesta ficha após o registro de vendas (Fases 5 e 6)."
      />

      <ConfirmDialog
        visible={confirmArchiveVisible}
        title={
          customer.is_archived
            ? 'Restaurar cadastro do cliente?'
            : 'Arquivar cadastro do cliente?'
        }
        description={
          customer.is_archived
            ? `O cadastro de ${customer.full_name} voltará a aparecer na lista de clientes ativos.`
            : `O cadastro de ${customer.full_name} será movido para a aba "Arquivados". Todo o histórico de vendas e recebimentos é preservado.`
        }
        confirmLabel={
          customer.is_archived ? 'Sim, restaurar' : 'Sim, arquivar'
        }
        loading={isArchiving}
        onConfirm={() => {
          void handleToggleArchive();
        }}
        onCancel={() => setConfirmArchiveVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarArchived: {
    backgroundColor: colors.warningSoft,
  },
  avatarLargeText: {
    ...typography.sectionLg,
    color: colors.primaryDark,
  },
  avatarTextArchived: {
    color: colors.warning,
  },
  profileTitleCol: {
    flex: 1,
    gap: spacing.xs,
  },
  customerName: {
    ...typography.sectionLg,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  detailTextCol: {
    flex: 1,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.bodyLg,
    color: colors.text,
    marginTop: 2,
  },
  actionsRow: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
});
