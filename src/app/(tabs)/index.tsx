import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  MetricCard,
  Screen,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, touchTarget, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { getRoleLabelPtBR } from '@/features/workspace/schemas';

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, session, activeWorkspace } = useSession();

  const greetingName =
    profile?.full_name ||
    session?.user.user_metadata?.full_name ||
    'Vendedor(a)';

  const workspaceName = activeWorkspace?.workspace.name ?? 'Meu Espaço';
  const roleLabel = activeWorkspace
    ? getRoleLabelPtBR(activeWorkspace.role)
    : 'Membro';

  return (
    <Screen>
      <AppHeader
        title={`Olá, ${greetingName}!`}
        subtitle={workspaceName}
        rightSlot={
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Abrir configurações e conta"
            style={styles.settingsButton}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        }
      />

      <View style={styles.badgeRow}>
        <StatusBadge label={`Papel: ${roleLabel}`} tone="neutral" />
        <StatusBadge label="Sem movimentações no período" tone="info" />
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard
          title="Vendido"
          cents={0}
          subtitle="Nenhuma venda confirmada"
          tone="default"
          iconName="trending-up-outline"
        />
        <MetricCard
          title="Recebido"
          cents={0}
          subtitle="Nenhum pagamento registrado"
          tone="primary"
          iconName="cash-outline"
        />
        <MetricCard
          title="A receber"
          cents={0}
          subtitle="0 parcelas em aberto"
          tone="warning"
          iconName="time-outline"
        />
        <MetricCard
          title="Vencido"
          cents={0}
          subtitle="0 parcelas em atraso"
          tone="error"
          iconName="alert-circle-outline"
        />
      </View>

      <Text style={styles.sectionTitle}>Atalhos rápidos</Text>
      <View style={styles.shortcutsRow}>
        <Pressable
          onPress={() => router.push('/customers')}
          accessibilityRole="button"
          accessibilityLabel="Abrir clientes"
          style={styles.shortcutCard}
        >
          <View style={styles.shortcutIcon}>
            <Ionicons name="people-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.shortcutTextCol}>
            <Text style={styles.shortcutTitle}>Clientes</Text>
            <Text style={styles.shortcutSubtitle}>Cadastro e histórico</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>

        <Pressable
          onPress={() => router.push('/products')}
          accessibilityRole="button"
          accessibilityLabel="Abrir catálogo de produtos"
          style={styles.shortcutCard}
        >
          <View style={styles.shortcutIcon}>
            <Ionicons name="pricetag-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.shortcutTextCol}>
            <Text style={styles.shortcutTitle}>Catálogo</Text>
            <Text style={styles.shortcutSubtitle}>Produtos e fotos</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Visão geral do período</Text>
      <EmptyState
        iconName="bar-chart-outline"
        title="Nenhum dado comercial registrado ainda"
        description="Gráficos e alertas aparecerão aqui assim que clientes, produtos, vendas e recebimentos forem cadastrados nas próximas etapas."
        actionLabel="Ver configurações da conta"
        onActionPress={() => router.push('/settings')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  settingsButton: {
    minWidth: touchTarget.minWidth,
    minHeight: touchTarget.minHeight,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
  shortcutsRow: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  shortcutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  shortcutIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTextCol: {
    flex: 1,
  },
  shortcutTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.text,
  },
  shortcutSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
