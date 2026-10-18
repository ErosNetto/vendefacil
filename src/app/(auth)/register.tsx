import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FormField,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SupabaseSetupNotice,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { mapAuthErrorMessage, signUpSchema } from '@/features/auth/schemas';
import { signUpWithEmail } from '@/features/auth/services';
import { useSession } from '@/features/auth/SessionProvider';

export default function RegisterScreen() {
  const router = useRouter();
  const { isConfigured, configReason, hasForbiddenKey } = useSession();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignUp(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});
    setFormError(null);

    const parsed = signUpSchema.safeParse({
      fullName,
      email,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        fullName: issues.fullName?.[0],
        email: issues.email?.[0],
        password: issues.password?.[0],
        confirmPassword: issues.confirmPassword?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUpWithEmail(
        parsed.data.fullName,
        parsed.data.email,
        parsed.data.password,
      );

      if (result.requiresEmailConfirmation) {
        setAwaitingEmailConfirmation(true);
      }
    } catch (error) {
      setFormError(mapAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen keyboardAvoiding contentContainerStyle={styles.container}>
      {!isConfigured ? (
        <SupabaseSetupNotice
          reason={configReason}
          hasForbiddenKey={hasForbiddenKey}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Criar conta no VendeFácil</Text>
        <Text style={styles.cardSubtitle}>
          Cadastre-se para organizar clientes, produtos, estoque e parcelas em um só lugar.
        </Text>

        {awaitingEmailConfirmation ? (
          <View style={styles.confirmationBox} accessibilityRole="alert">
            <View style={styles.confirmationIcon}>
              <Ionicons name="mail-unread-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.confirmationTitle}>Confirme seu e-mail</Text>
            <Text style={styles.confirmationText}>
              Enviamos um link de confirmação para {email.trim().toLowerCase()}. Após
              confirmar, acesse sua conta para criar seu espaço de trabalho.
            </Text>
            <SecondaryButton
              label="Ir para o login"
              onPress={() => router.replace('/(auth)/login')}
              iconName="arrow-back-outline"
            />
          </View>
        ) : (
          <>
            {formError ? (
              <View style={styles.errorAlert} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorAlertText}>{formError}</Text>
              </View>
            ) : null}

            <FormField
              label="Seu nome completo"
              placeholder="Ex.: Maria Oliveira"
              autoCapitalize="words"
              leftIcon="person-outline"
              value={fullName}
              onChangeText={setFullName}
              errorMessage={fieldErrors.fullName}
              editable={!isSubmitting}
            />

            <FormField
              label="E-mail"
              placeholder="seuemail@exemplo.com.br"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon="mail-outline"
              value={email}
              onChangeText={setEmail}
              errorMessage={fieldErrors.email}
              editable={!isSubmitting}
            />

            <FormField
              label="Senha"
              placeholder="Mínimo de 8 caracteres"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon="lock-closed-outline"
              isPassword
              value={password}
              onChangeText={setPassword}
              errorMessage={fieldErrors.password}
              editable={!isSubmitting}
            />

            <FormField
              label="Confirmar senha"
              placeholder="Repita a senha criada"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon="shield-checkmark-outline"
              isPassword
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              errorMessage={fieldErrors.confirmPassword}
              editable={!isSubmitting}
            />

            <PrimaryButton
              label="Criar minha conta"
              onPress={() => {
                void handleSignUp();
              }}
              loading={isSubmitting}
              disabled={!isConfigured}
              iconName="person-add-outline"
            />

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Já possui uma conta?</Text>
              <Pressable
                onPress={() => router.replace('/(auth)/login')}
                accessibilityRole="button"
                accessibilityLabel="Voltar para o login"
                hitSlop={8}
              >
                <Text style={styles.footerLink}>Fazer login</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
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
  confirmationBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  confirmationIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationTitle: {
    ...typography.section,
    color: colors.primaryDark,
  },
  confirmationText: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
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
