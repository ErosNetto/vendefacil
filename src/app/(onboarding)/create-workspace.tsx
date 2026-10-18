import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ErrorState,
  FormField,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import { createWorkspaceSchema } from '@/features/workspace/schemas';
import { createWorkspaceViaRpc } from '@/features/workspace/services';

export default function CreateWorkspaceScreen() {
  const {
    session,
    profile,
    workspaceError,
    refreshWorkspaceContext,
    signOut,
  } = useSession();

  const [workspaceName, setWorkspaceName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const userDisplayName =
    profile?.full_name ||
    session?.user.user_metadata?.full_name ||
    session?.user.email ||
    'Vendedor(a)';

  async function handleCreateWorkspace(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setFieldError(null);
    setSubmitError(null);

    const parsed = createWorkspaceSchema.safeParse({ name: workspaceName });
    if (!parsed.success) {
      const issue = parsed.error.flatten().fieldErrors.name?.[0];
      setFieldError(issue ?? 'Informe um nome válido para o seu negócio.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createWorkspaceViaRpc(parsed.data.name);
      await refreshWorkspaceContext();
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : '';
      if (rawMessage.includes('create_workspace') || rawMessage.includes('function')) {
        setSubmitError(
          'A função create_workspace não foi encontrada no banco. Execute a migração SQL da Fase 1 no SQL Editor do Supabase.',
        );
      } else {
        setSubmitError(
          rawMessage ||
            'Não foi possível criar seu espaço de trabalho. Verifique sua conexão e tente novamente.',
        );
      }
    } finally {
      setIsSubmitting(false);
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
    <Screen keyboardAvoiding contentContainerStyle={styles.container}>
      <View style={styles.heroBox}>
        <View style={styles.iconCircle}>
          <Ionicons name="storefront-outline" size={32} color={colors.primary} />
        </View>
        <StatusBadge label="Primeiro acesso • Configuração" tone="neutral" />
        <Text style={styles.title}>Olá, {userDisplayName}!</Text>
        <Text style={styles.subtitle}>
          Você ainda não participa de nenhum espaço de trabalho. Crie o espaço da sua loja
          para organizar vendas, clientes, estoque e finanças com isolamento total.
        </Text>
      </View>

      {workspaceError ? (
        <View style={styles.sectionSpacing}>
          <ErrorState
            title="Erro ao consultar espaços existentes"
            message={workspaceError}
            retryLabel="Verificar novamente"
            onRetry={() => {
              void refreshWorkspaceContext();
            }}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Criar meu espaço de trabalho</Text>
        <Text style={styles.cardDescription}>
          Você será registrado(a) automaticamente como Proprietário(a) (`owner`) e todos os
          seus dados comerciais ficarão protegidos por políticas RLS no banco.
        </Text>

        {submitError ? (
          <View style={styles.errorAlert} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorAlertText}>{submitError}</Text>
          </View>
        ) : null}

        <FormField
          label="Nome da sua loja ou negócio"
          placeholder="Ex.: Studio Maria Cosméticos"
          leftIcon="business-outline"
          value={workspaceName}
          onChangeText={setWorkspaceName}
          errorMessage={fieldError}
          helperText="Entre 2 e 80 caracteres. Você poderá alterar este nome depois."
          editable={!isSubmitting}
        />

        <PrimaryButton
          label="Começar a usar o VendeFácil"
          onPress={() => {
            void handleCreateWorkspace();
          }}
          loading={isSubmitting}
          iconName="checkmark-circle-outline"
        />
      </View>

      <View style={styles.footerActions}>
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
  container: {
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  heroBox: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sectionSpacing: {
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
  },
  cardTitle: {
    ...typography.sectionLg,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorSoft,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.control,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorAlertText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
  footerActions: {
    marginTop: spacing.xl,
  },
});
