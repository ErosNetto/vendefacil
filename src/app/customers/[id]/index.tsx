import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  MoneyText,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { getCustomerInitials } from '@/features/customers/schemas';
import {
  getWorkspaceCustomerById,
  mapCustomerServiceError,
  setWorkspaceCustomerArchived,
} from '@/features/customers/services';
import { ReceivePaymentModal } from '@/features/finance/ReceivePaymentModal';
import {
  getInstallmentDisplayMeta,
  getTodayISODate,
  getWorkspaceFinanceSettings,
} from '@/features/finance/schemas';
import {
  listWorkspaceInstallments,
  listWorkspacePayments,
} from '@/features/finance/services';
import {
  calculateSalesOverviewMetrics,
  SALE_STATUS_META,
} from '@/features/sales/schemas';
import { listWorkspaceSales } from '@/features/sales/services';
import {
  buildCustomerOpenSummaryWhatsAppMessage,
  buildSmartInstallmentWhatsAppMessage,
  shouldIncludePixInWhatsApp,
  shouldShowInstallmentWhatsAppCharge,
} from '@/features/whatsapp/schemas';
import {
  openWhatsAppWithMessage,
  useWorkspacePixSettings,
} from '@/features/whatsapp/services';
import type {
  CustomerRow,
  InstallmentRow,
  PaymentRow,
  SaleRow,
} from '@/types/database';
import {
  formatCentsToBRL,
  formatDateBR,
  formatDateTimeBR,
} from '@/utils/formatters';

export default function CustomerDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const { showToast } = useToast();
  const workspaceId = activeWorkspace?.workspace.id ?? null;
  const workspaceName = activeWorkspace?.workspace.name ?? 'VendeFácil';
  const financeSettings = getWorkspaceFinanceSettings(
    activeWorkspace?.workspace,
  );
  const { pixSettings } = useWorkspacePixSettings(activeWorkspace?.workspace);
  const todayISO = useMemo(() => getTodayISODate(), []);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [customerSales, setCustomerSales] = useState<SaleRow[]>([]);
  const [customerInstallments, setCustomerInstallments] = useState<
    InstallmentRow[]
  >([]);
  const [customerPayments, setCustomerPayments] = useState<PaymentRow[]>([]);
  const [paymentModalInstallments, setPaymentModalInstallments] = useState<
    InstallmentRow[]
  >([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmArchiveVisible, setConfirmArchiveVisible] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    hasLoadedRef.current = false;
  }, [id, workspaceId]);

  const loadCustomer = useCallback(
    async (isSilent = false) => {
      if (!workspaceId || !id) {
        setIsLoading(false);
        return;
      }

      if (!isSilent && !hasLoadedRef.current) {
        setIsLoading(true);
      }
      setErrorMessage(null);
      try {
        const record = await getWorkspaceCustomerById(workspaceId, id);
        if (!record) {
          setErrorMessage('Cliente não encontrado neste espaço de trabalho.');
        } else {
          setCustomer(record);
          const [sales, installments, payments] = await Promise.all([
            listWorkspaceSales({
              workspaceId,
              customerId: record.id,
            }).catch(() => []),
            listWorkspaceInstallments(workspaceId, {
              customerId: record.id,
            }).catch(() => []),
            listWorkspacePayments(workspaceId, {
              customerId: record.id,
            }).catch(() => []),
          ]);
          setCustomerSales(sales);
          setCustomerInstallments(installments);
          setCustomerPayments(payments);
        }
        hasLoadedRef.current = true;
      } catch (error) {
        setErrorMessage(mapCustomerServiceError(error));
      } finally {
        setIsLoading(false);
      }
    },
    [id, workspaceId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadCustomer(true);
    }, [loadCustomer]),
  );

  const salesMetrics = useMemo(
    () => calculateSalesOverviewMetrics(customerSales),
    [customerSales],
  );

  const openInstallments = useMemo(
    () =>
      customerInstallments.filter(
        (i) =>
          i.status !== 'cancelled' &&
          i.status !== 'paid' &&
          i.remaining_principal_cents > 0,
      ),
    [customerInstallments],
  );

  const openPrincipalCents = useMemo(
    () =>
      openInstallments.reduce(
        (sum, item) => sum + item.remaining_principal_cents,
        0,
      ),
    [openInstallments],
  );

  const validPayments = useMemo(
    () => customerPayments.filter((p) => !p.is_reversed),
    [customerPayments],
  );

  const totalPaidCents = useMemo(
    () => validPayments.reduce((sum, p) => sum + p.amount_cents, 0),
    [validPayments],
  );

  const salePaymentMethodMap = useMemo(
    () => new Map(customerSales.map((s) => [s.id, s.payment_method])),
    [customerSales],
  );

  const chargeableOpenInstallments = useMemo(
    () =>
      openInstallments.filter((inst) =>
        shouldShowInstallmentWhatsAppCharge(
          salePaymentMethodMap.get(inst.sale_id),
        ),
      ),
    [openInstallments, salePaymentMethodMap],
  );

  const chargeablePrincipalCents = useMemo(
    () =>
      chargeableOpenInstallments.reduce(
        (sum, item) => sum + item.remaining_principal_cents,
        0,
      ),
    [chargeableOpenInstallments],
  );

  function handleSendCustomerWhatsAppSummary(): void {
    if (!customer) return;
    if (chargeableOpenInstallments.length > 0) {
      const hasPixCompatible = chargeableOpenInstallments.some((inst) =>
        shouldIncludePixInWhatsApp(salePaymentMethodMap.get(inst.sale_id)),
      );
      const allDebitCard = chargeableOpenInstallments.every(
        (inst) => salePaymentMethodMap.get(inst.sale_id) === 'debit_card',
      );
      const message = buildCustomerOpenSummaryWhatsAppMessage({
        customerName: customer.full_name,
        openInstallments: chargeableOpenInstallments,
        includePix: hasPixCompatible,
        paymentMethodNote: allDebitCard ? 'Cartão de Débito' : null,
        workspaceName,
        pix: pixSettings,
      });
      void openWhatsAppWithMessage({ phone: customer.phone, message });
    } else {
      const message = `Olá, *${customer.full_name}*! Tudo bem? Aqui é de *${workspaceName}*. Como posso ajudar você hoje?`;
      void openWhatsAppWithMessage({ phone: customer.phone, message });
    }
  }

  function handleSendInstallmentWhatsApp(inst: InstallmentRow): void {
    const message = buildSmartInstallmentWhatsAppMessage({
      installment: inst,
      todayISO,
      financeSettings,
      paymentMethod: salePaymentMethodMap.get(inst.sale_id),
      workspaceName,
      pix: pixSettings,
    });
    void openWhatsAppWithMessage({ phone: customer?.phone, message });
  }

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
      showToast({
        tone: 'info',
        title: updated.is_archived ? 'Cliente arquivado' : 'Cliente reativado',
        message: updated.is_archived
          ? `${customer.full_name} foi arquivado(a) e ocultado da busca padrão.`
          : `${customer.full_name} foi reativado(a) com sucesso.`,
      });
    } catch (error) {
      setConfirmArchiveVisible(false);
      const errMsg = mapCustomerServiceError(error);
      setErrorMessage(errMsg);
      showToast({
        tone: 'error',
        title: 'Erro ao alterar status',
        message: errMsg,
      });
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
              label={
                customer.is_archived ? 'Cliente arquivado' : 'Cliente ativo'
              }
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
          <Pressable
            accessibilityRole="button"
            onPress={handleSendCustomerWhatsAppSummary}
            style={styles.whatsAppActionBanner}
          >
            <View style={styles.whatsAppIconBadge}>
              <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.whatsAppTextCol}>
              <Text style={styles.whatsAppBannerTitle}>
                {chargeableOpenInstallments.length > 0
                  ? 'Enviar resumo de cobrança no WhatsApp'
                  : 'Conversar com cliente no WhatsApp'}
              </Text>
              <Text style={styles.whatsAppBannerSubtitle}>
                {chargeableOpenInstallments.length > 0
                  ? `Envia as ${chargeableOpenInstallments.length} parcela(s) em aberto (${formatCentsToBRL(chargeablePrincipalCents)})`
                  : customer.phone
                    ? `Abre conversa direta com ${customer.phone}`
                    : 'Abre o WhatsApp para escolher o contato'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#128C7E" />
          </Pressable>

          {!customer.is_archived ? (
            <PrimaryButton
              label="Nova venda para este cliente"
              iconName="cart-outline"
              onPress={() =>
                router.push({
                  pathname: '/sales/new',
                  params: { customerId: customer.id },
                })
              }
            />
          ) : null}
          <SecondaryButton
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
          cents={salesMetrics.confirmedRevenueCents}
          subtitle={
            salesMetrics.confirmedCount === 1
              ? '1 venda confirmada'
              : `${salesMetrics.confirmedCount} vendas confirmadas`
          }
          tone="default"
          iconName="bag-check-outline"
        />
        <MetricCard
          title="Total pago"
          cents={totalPaidCents}
          subtitle={
            validPayments.length === 1
              ? '1 recebimento registrado'
              : `${validPayments.length} recebimentos registrados`
          }
          tone="primary"
          iconName="cash-outline"
        />
        <MetricCard
          title="Saldo em aberto"
          cents={openPrincipalCents}
          subtitle={
            openInstallments.length === 1
              ? '1 parcela pendente'
              : `${openInstallments.length} parcelas pendentes`
          }
          tone={openPrincipalCents > 0 ? 'warning' : 'default'}
          iconName="time-outline"
        />
      </View>

      {openInstallments.length > 0 ? (
        <View style={styles.receivablesSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleNoMargin}>
              Parcelas em aberto ({openInstallments.length})
            </Text>
            {openInstallments.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPaymentModalInstallments(openInstallments);
                  setIsPaymentModalOpen(true);
                }}
                style={styles.batchPayBtn}
              >
                <Text style={styles.batchPayBtnText}>Receber várias</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.salesList}>
            {openInstallments.map((inst) => {
              const meta = getInstallmentDisplayMeta(inst);
              return (
                <View key={inst.id} style={styles.installmentItemCard}>
                  <View style={styles.installmentTopRow}>
                    <View style={styles.saleItemLeft}>
                      <Text style={styles.saleItemTitle}>
                        {inst.installment_number === 0
                          ? 'Entrada'
                          : `Parcela ${inst.installment_number}/${inst.total_installments}`}{' '}
                        • Venc.: {formatDateBR(inst.due_date)}
                      </Text>
                      <Text style={styles.saleItemMeta}>
                        Valor original: {formatCentsToBRL(inst.principal_cents)}
                      </Text>
                    </View>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </View>

                  <View style={styles.installmentBottomRow}>
                    <View>
                      <Text style={styles.saleItemMeta}>Saldo a receber</Text>
                      <MoneyText
                        cents={inst.remaining_principal_cents}
                        size="sm"
                        tone={meta.state === 'overdue' ? 'error' : 'primary'}
                      />
                    </View>
                    <View style={styles.installmentActionPills}>
                      {shouldShowInstallmentWhatsAppCharge(
                        salePaymentMethodMap.get(inst.sale_id),
                      ) ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleSendInstallmentWhatsApp(inst)}
                          style={styles.whatsAppPillBtn}
                        >
                          <Ionicons name="logo-whatsapp" size={13} color="#128C7E" />
                          <Text style={styles.whatsAppPillBtnText}>
                            {meta.state === 'overdue' ? 'Cobrar' : 'Lembrar'}
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setPaymentModalInstallments([inst]);
                          setIsPaymentModalOpen(true);
                        }}
                        style={styles.receivePillBtn}
                      >
                        <Text style={styles.receivePillBtnText}>Receber</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        Histórico de vendas ({customerSales.length})
      </Text>
      {customerSales.length === 0 ? (
        <EmptyState
          iconName="receipt-outline"
          title="Nenhuma venda vinculada a este cliente"
          description="Registre uma venda para este cliente para acompanhar compras, itens e futuros recebimentos."
          actionLabel={
            !customer.is_archived ? 'Registrar venda agora' : undefined
          }
          onActionPress={
            !customer.is_archived
              ? () =>
                  router.push({
                    pathname: '/sales/new',
                    params: { customerId: customer.id },
                  })
              : undefined
          }
        />
      ) : (
        <View style={styles.salesList}>
          {customerSales.map((sale) => {
            const statusMeta = SALE_STATUS_META[sale.status];
            return (
              <Pressable
                key={sale.id}
                accessibilityRole="button"
                onPress={() => router.push(`/sales/${sale.id}`)}
                style={styles.saleItemCard}
              >
                <View style={styles.saleItemLeft}>
                  <Text style={styles.saleItemTitle}>
                    Venda #{sale.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={styles.saleItemMeta}>
                    {formatDateTimeBR(sale.created_at)} •{' '}
                    {sale.item_count === 1
                      ? '1 item'
                      : `${sale.item_count} itens`}
                  </Text>
                </View>

                <View style={styles.saleItemRight}>
                  <MoneyText
                    cents={sale.total_cents}
                    size="sm"
                    tone={sale.status === 'cancelled' ? 'error' : 'primary'}
                  />
                  <StatusBadge
                    label={statusMeta.label}
                    tone={statusMeta.tone}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

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

      {workspaceId ? (
        <ReceivePaymentModal
          visible={isPaymentModalOpen}
          workspaceId={workspaceId}
          installments={paymentModalInstallments}
          financeSettings={financeSettings}
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            setIsPaymentModalOpen(false);
            void loadCustomer(true);
          }}
        />
      ) : null}
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
  whatsAppActionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F8F5',
    borderWidth: 1,
    borderColor: '#A3E4D7',
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  whatsAppIconBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsAppTextCol: {
    flex: 1,
    gap: 2,
  },
  whatsAppBannerTitle: {
    ...typography.bodyStrong,
    color: '#0E6655',
  },
  whatsAppBannerSubtitle: {
    ...typography.caption,
    color: '#117A65',
  },
  installmentActionPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  whatsAppPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F8F5',
    borderWidth: 1,
    borderColor: '#A3E4D7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  whatsAppPillBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: '#0E6655',
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitleNoMargin: {
    ...typography.section,
    color: colors.text,
  },
  receivablesSection: {
    marginBottom: spacing.xl,
  },
  batchPayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  batchPayBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  receivePillBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: 2,
  },
  receivePillBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.surface,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  salesList: {
    gap: spacing.sm,
  },
  saleItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  installmentItemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  installmentTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  installmentBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  saleItemLeft: {
    flex: 1,
    gap: 2,
  },
  saleItemTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  saleItemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  saleItemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
});
