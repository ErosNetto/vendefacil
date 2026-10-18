import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  ConfirmDialog,
  ErrorState,
  FormField,
  LoadingState,
  MoneyText,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { cancelSaleSchema, SALE_STATUS_META } from '@/features/sales/schemas';
import {
  cancelWorkspaceSale,
  confirmWorkspaceDraftSale,
  getWorkspaceSaleDetail,
  mapSaleServiceError,
} from '@/features/sales/services';
import type { SaleItemRow, SaleRow } from '@/types/database';
import { formatCentsToBRL, formatDateTimeBR } from '@/utils/formatters';

export default function SaleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [sale, setSale] = useState<SaleRow | null>(null);
  const [items, setItems] = useState<SaleItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [confirmDraftModalOpen, setConfirmDraftModalOpen] = useState(false);
  const [isConfirmingDraft, setIsConfirmingDraft] = useState(false);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(
    null,
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadSaleDetail = useCallback(async () => {
    if (!workspaceId || !id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const detail = await getWorkspaceSaleDetail(workspaceId, id);
      if (!detail) {
        setErrorMessage('Venda não encontrada neste espaço de trabalho.');
        return;
      }
      setSale(detail.sale);
      setItems(detail.items);
    } catch (error) {
      setErrorMessage(mapSaleServiceError(error));
    } finally {
      setIsLoading(false);
    }
  }, [id, workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void loadSaleDetail();
    }, [loadSaleDetail]),
  );

  async function handleConfirmDraft(): Promise<void> {
    if (!workspaceId || !sale || isConfirmingDraft) {
      return;
    }

    setIsConfirmingDraft(true);
    setActionError(null);
    try {
      await confirmWorkspaceDraftSale(workspaceId, sale.id);
      setConfirmDraftModalOpen(false);
      await loadSaleDetail();
    } catch (error) {
      setConfirmDraftModalOpen(false);
      setActionError(mapSaleServiceError(error));
    } finally {
      setIsConfirmingDraft(false);
    }
  }

  async function handleCancelSale(): Promise<void> {
    if (!workspaceId || !sale || isCancelling) {
      return;
    }

    setCancelReasonError(null);
    setActionError(null);

    const parsed = cancelSaleSchema.safeParse({ reason: cancelReason });
    if (!parsed.success) {
      setCancelReasonError(
        parsed.error.issues[0]?.message ?? 'Informe o motivo do cancelamento.',
      );
      return;
    }

    setIsCancelling(true);
    try {
      await cancelWorkspaceSale(workspaceId, sale.id, parsed.data.reason);
      setShowCancelForm(false);
      setCancelReason('');
      await loadSaleDetail();
    } catch (error) {
      setActionError(mapSaleServiceError(error));
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Carregando detalhes da venda..." />
      </Screen>
    );
  }

  if (errorMessage || !sale) {
    return (
      <Screen>
        <AppHeader title="Venda" showBack />
        <ErrorState
          title="Não foi possível abrir a venda"
          message={errorMessage ?? 'Venda não localizada.'}
          onRetry={() => {
            void loadSaleDetail();
          }}
        />
      </Screen>
    );
  }

  const statusMeta = SALE_STATUS_META[sale.status];

  return (
    <Screen>
      <AppHeader
        title="Detalhe da venda"
        subtitle={`Código #${sale.id.slice(0, 8).toUpperCase()}`}
        showBack
      />

      {/* Cabeçalho e Status */}
      <View style={styles.card}>
        <View style={styles.topBadgeRow}>
          <StatusBadge
            label={`Venda ${statusMeta.label.toLowerCase()}`}
            tone={statusMeta.tone}
          />
          <Text style={styles.dateText}>
            {formatDateTimeBR(sale.created_at)}
          </Text>
        </View>

        <View style={styles.customerSection}>
          <View style={styles.customerIconWrap}>
            <Ionicons
              name="person-outline"
              size={20}
              color={colors.primaryDark}
            />
          </View>
          <View style={styles.customerTextCol}>
            <Text style={styles.metaLabel}>Cliente</Text>
            <Text style={styles.customerName}>
              {sale.customer_name_snapshot ?? 'Venda avulsa (Balcão)'}
            </Text>
          </View>
          {sale.customer_id ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/customers/${sale.customer_id}`)}
              style={styles.openCustomerButton}
            >
              <Text style={styles.openCustomerText}>Ver ficha</Text>
            </Pressable>
          ) : null}
        </View>

        {sale.confirmed_at ? (
          <Text style={styles.timestampNote}>
            Confirmada em {formatDateTimeBR(sale.confirmed_at)}
          </Text>
        ) : null}

        {sale.status === 'cancelled' ? (
          <View style={styles.cancelledBanner}>
            <View style={styles.cancelledHeader}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.error}
              />
              <Text style={styles.cancelledTitle}>
                Venda cancelada
                {sale.cancelled_at
                  ? ` em ${formatDateTimeBR(sale.cancelled_at)}`
                  : ''}
              </Text>
            </View>
            {sale.cancellation_reason ? (
              <Text style={styles.cancelledReasonText}>
                Motivo: {sale.cancellation_reason}
              </Text>
            ) : null}
          </View>
        ) : null}

        {sale.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.metaLabel}>Observações</Text>
            <Text style={styles.notesValue}>{sale.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Itens com Snapshot Imutável (RF-041) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Itens da venda ({items.length})
        </Text>
        <Text style={styles.snapshotHint}>
          Preços e custos preservados exatamente como no momento da venda.
        </Text>

        <View style={styles.itemsList}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push(`/products/${item.product_id}`)}
              style={styles.itemRow}
            >
              <View style={styles.itemLeftCol}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.product_name_snapshot}
                </Text>
                <Text style={styles.itemSubMeta}>
                  {item.quantity} un. × {formatCentsToBRL(item.unit_price_cents)}
                  {item.sku_snapshot ? ` • SKU: ${item.sku_snapshot}` : ''}
                </Text>
                <Text style={styles.itemCostMeta}>
                  Custo snapshot: {formatCentsToBRL(item.unit_cost_cents)} / un.
                </Text>
              </View>

              <View style={styles.itemRightCol}>
                <MoneyText
                  cents={item.line_total_cents}
                  size="sm"
                  tone="primary"
                />
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textSecondary}
                />
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Resumo Financeiro e Ações */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Resumo financeiro</Text>

        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal dos itens</Text>
            <Text style={styles.summaryValue}>
              {formatCentsToBRL(sale.subtotal_cents)}
            </Text>
          </View>

          {sale.discount_cents > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Desconto aplicado</Text>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                - {formatCentsToBRL(sale.discount_cents)}
              </Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total da venda</Text>
            <MoneyText
              cents={sale.total_cents}
              size="lg"
              tone={sale.status === 'cancelled' ? 'error' : 'primary'}
            />
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryCaption}>Custo total estimado</Text>
            <Text style={styles.summaryCaption}>
              {formatCentsToBRL(sale.estimated_cost_cents)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryCaption}>Lucro estimado</Text>
            <Text style={styles.profitStrong}>
              {formatCentsToBRL(sale.estimated_profit_cents)}
            </Text>
          </View>
        </View>

        {actionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{actionError}</Text>
          </View>
        ) : null}

        {sale.status !== 'cancelled' ? (
          <View style={styles.actionsColumn}>
            {sale.status === 'draft' ? (
              <>
                <PrimaryButton
                  label="Confirmar venda e baixar estoque"
                  iconName="checkmark-circle-outline"
                  onPress={() => setConfirmDraftModalOpen(true)}
                />
                <SecondaryButton
                  label="Editar rascunho"
                  iconName="create-outline"
                  onPress={() =>
                    router.push({
                      pathname: '/sales/new',
                      params: { draftSaleId: sale.id },
                    })
                  }
                />
              </>
            ) : null}

            {!showCancelForm ? (
              <SecondaryButton
                label={
                  sale.status === 'confirmed'
                    ? 'Cancelar venda e estornar estoque'
                    : 'Cancelar rascunho'
                }
                iconName="close-circle-outline"
                onPress={() => setShowCancelForm(true)}
              />
            ) : (
              <View style={styles.cancelFormBox}>
                <Text style={styles.cancelFormTitle}>
                  {sale.status === 'confirmed'
                    ? 'Confirmar cancelamento e estorno de estoque'
                    : 'Confirmar cancelamento do rascunho'}
                </Text>
                <Text style={styles.cancelFormDescription}>
                  {sale.status === 'confirmed'
                    ? 'As unidades vendidas serão devolvidas automaticamente ao estoque com registro de estorno auditável.'
                    : 'O rascunho ficará registrado como cancelado para auditoria.'}
                </Text>

                <FormField
                  label="Motivo do cancelamento *"
                  placeholder="Ex.: Cliente solicitou troca ou desistiu da compra"
                  value={cancelReason}
                  onChangeText={(val) => {
                    setCancelReason(val);
                    setCancelReasonError(null);
                  }}
                  errorMessage={cancelReasonError ?? undefined}
                />

                <View style={styles.cancelFormButtons}>
                  <PrimaryButton
                    label="Confirmar cancelamento"
                    iconName="alert-circle-outline"
                    loading={isCancelling}
                    onPress={() => {
                      void handleCancelSale();
                    }}
                  />
                  <SecondaryButton
                    label="Voltar"
                    disabled={isCancelling}
                    onPress={() => {
                      setShowCancelForm(false);
                      setCancelReasonError(null);
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmDraftModalOpen}
        title="Confirmar esta venda?"
        description="Ao confirmar o rascunho, o estoque de todos os itens será baixado atomicamente."
        confirmLabel="Sim, confirmar venda"
        loading={isConfirmingDraft}
        onConfirm={() => {
          void handleConfirmDraft();
        }}
        onCancel={() => setConfirmDraftModalOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  topBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dateText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  customerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  customerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerTextCol: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  customerName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  openCustomerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  openCustomerText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  timestampNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cancelledBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.error,
    padding: spacing.md,
    gap: 4,
  },
  cancelledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cancelledTitle: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  cancelledReasonText: {
    ...typography.caption,
    color: colors.text,
  },
  notesBox: {
    backgroundColor: colors.background,
    borderRadius: radius.control,
    padding: spacing.md,
    gap: 4,
  },
  notesValue: {
    ...typography.body,
    color: colors.text,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  snapshotHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  itemsList: {
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemLeftCol: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  itemSubMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemCostMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  totalLabel: {
    ...typography.section,
    color: colors.text,
  },
  summaryCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  profitStrong: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.control,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.error,
  },
  actionsColumn: {
    gap: spacing.sm,
  },
  cancelFormBox: {
    backgroundColor: colors.background,
    borderRadius: radius.controlLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cancelFormTitle: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  cancelFormDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cancelFormButtons: {
    gap: spacing.sm,
  },
});
