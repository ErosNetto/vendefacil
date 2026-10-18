import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppHeader, Screen, SecondaryButton, StatusBadge } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { getRoleLabelPtBR } from '@/features/workspace/schemas';
import { formatDateBR } from '@/utils/formatters';

export default function SettingsScreen() {
  const {
    session,
    profile,
    workspaces,
    activeWorkspace,
    selectWorkspace,
    refreshWorkspaceContext,
    signOut,
  } = useSession();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleRefresh(): Promise<void> {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await refreshWorkspaceContext();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Screen>
      <AppHeader
        title="Configurações e Conta"
        subtitle={activeWorkspace?.workspace.name ?? 'Preferências'}
        showBack
      />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Perfil do vendedor</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Nome</Text>
          <Text style={styles.infoValue}>
            {profile?.full_name ||
              session?.user.user_metadata?.full_name ||
              'Não informado'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>E-mail</Text>
          <Text style={styles.infoValue}>{session?.user.email ?? '---'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Espaço de trabalho ativo</Text>
        {activeWorkspace ? (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Loja / Negócio</Text>
              <Text style={styles.infoValue}>{activeWorkspace.workspace.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Seu papel</Text>
              <StatusBadge
                label={getRoleLabelPtBR(activeWorkspace.role)}
                tone="neutral"
              />
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Moeda padrão</Text>
              <Text style={styles.infoValue}>
                {activeWorkspace.workspace.currency_code} (Real Brasileiro)
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Criado em</Text>
              <Text style={styles.infoValue}>
                {formatDateBR(activeWorkspace.workspace.created_at)}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>Nenhum espaço selecionado.</Text>
        )}
      </View>

      {workspaces.length > 1 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Alternar espaço de trabalho</Text>
          {workspaces.map((item) => {
            const isSelected =
              item.workspace.id === activeWorkspace?.workspace.id;
            return (
              <Pressable
                key={item.workspace.id}
                onPress={() => selectWorkspace(item.workspace.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.workspaceOption,
                  isSelected ? styles.workspaceOptionSelected : null,
                ]}
              >
                <View style={styles.workspaceOptionText}>
                  <Text style={styles.workspaceOptionTitle}>
                    {item.workspace.name}
                  </Text>
                  <Text style={styles.workspaceOptionRole}>
                    {getRoleLabelPtBR(item.role)}
                  </Text>
                </View>
                <Ionicons
                  name={
                    isSelected ? 'checkmark-circle' : 'ellipse-outline'
                  }
                  size={22}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actionsColumn}>
        <SecondaryButton
          label="Sincronizar dados da conta"
          onPress={() => {
            void handleRefresh();
          }}
          loading={isRefreshing}
          iconName="refresh-outline"
        />

        <SecondaryButton
          label="Sair da conta"
          onPress={() => {
            void handleSignOut();
          }}
          loading={isSigningOut}
          iconName="log-out-outline"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  workspaceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  workspaceOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  workspaceOptionText: {
    flex: 1,
  },
  workspaceOptionTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  workspaceOptionRole: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionsColumn: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
