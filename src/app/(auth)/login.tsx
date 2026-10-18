import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FormField,
  PrimaryButton,
  Screen,
  SupabaseSetupNotice,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { loginSchema, mapAuthErrorMessage } from '@/features/auth/schemas';
import { signInWithEmail } from '@/features/auth/services';
import { useSession } from '@/features/auth/SessionProvider';

export default function LoginScreen() {
  const router = useRouter();
  const { isConfigured, configReason, hasForbiddenKey } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: issues.email?.[0],
        password: issues.password?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await signInWithEmail(parsed.data.email, parsed.data.password);
    } catch (error) {
      setFormError(mapAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen keyboardAvoiding contentContainerStyle={styles.container}>
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <Ionicons name="bag-handle" size={32} color={colors.white} />
        </View>
        <Text style={styles.brandName}>VendeFácil</Text>
        <Text style={styles.brandTagline}>
          Sua loja e seu controle comercial de forma simples.
        </Text>
      </View>

      {!isConfigured ? (
        <SupabaseSetupNotice
          reason={configReason}
          hasForbiddenKey={hasForbiddenKey}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bem-vindo(a) de volta!</Text>
        <Text style={styles.cardSubtitle}>
          Acesse sua conta para gerenciar clientes, estoque, vendas e recebimentos.
        </Text>

        {formError ? (
          <View style={styles.errorAlert} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorAlertText}>{formError}</Text>
          </View>
        ) : null}

        <FormField
          label="E-mail"
          placeholder="seuemail@exemplo.com.br"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          leftIcon="mail-outline"
          value={email}
          onChangeText={setEmail}
          errorMessage={fieldErrors.email}
          editable={!isSubmitting}
        />

        <FormField
          label="Senha"
          placeholder="Digite sua senha"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          leftIcon="lock-closed-outline"
          isPassword
          value={password}
          onChangeText={setPassword}
          errorMessage={fieldErrors.password}
          editable={!isSubmitting}
        />

        <PrimaryButton
          label="Entrar"
          onPress={() => {
            void handleLogin();
          }}
          loading={isSubmitting}
          disabled={!isConfigured}
          iconName="log-in-outline"
        />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Ainda não tem uma conta?</Text>
          <Pressable
            onPress={() => router.push('/(auth)/register')}
            accessibilityRole="button"
            accessibilityLabel="Criar nova conta"
            hitSlop={8}
          >
            <Text style={styles.footerLink}>Criar conta</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.cardLg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandName: {
    ...typography.titleLg,
    color: colors.text,
  },
  brandTagline: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
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
  cardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footerLink: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
});
