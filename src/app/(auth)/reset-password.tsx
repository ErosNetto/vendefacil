import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  FormField,
  LoadingState,
  PrimaryButton,
  Screen,
  SecondaryButton,
  useToast,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  mapAuthErrorMessage,
  resetPasswordSchema,
} from '@/features/auth/schemas';
import {
  setAuthSessionFromTokens,
  signOutUser,
  updateUserPassword,
} from '@/features/auth/services';
import { useSession } from '@/features/auth/SessionProvider';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    type?: string;
    error?: string;
    error_description?: string;
  }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initRecoverySession() {
      if (params.error || params.error_description) {
        if (isMounted) {
          setSessionError(
            params.error_description ||
              'O link de recuperação expirou ou é inválido. Solicite um novo link.',
          );
          setIsInitializing(false);
        }
        return;
      }

      if (params.access_token && params.refresh_token) {
        try {
          await setAuthSessionFromTokens(
            params.access_token,
            params.refresh_token,
          );
        } catch (err) {
          if (isMounted) {
            setSessionError(mapAuthErrorMessage(err));
          }
        }
      }

      if (isMounted) {
        setIsInitializing(false);
      }
    }

    void initRecoverySession();

    return () => {
      isMounted = false;
    };
  }, [params.access_token, params.error, params.error_description, params.refresh_token]);

  const hasValidSession = Boolean(session || (params.access_token && !sessionError));

  async function handleResetPassword(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        password: issues.password?.[0],
        confirmPassword: issues.confirmPassword?.[0],
      });
      showToast({
        tone: 'warning',
        title: 'Revise os dados',
        message: 'Preencha a nova senha corretamente.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUserPassword(parsed.data.password);
      showToast({
        tone: 'success',
        title: 'Senha atualizada!',
        message: 'Sua nova senha foi salva. Faça login com suas novas credenciais.',
      });
      await signOutUser();
      router.replace('/(auth)/login');
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'Falha ao redefinir',
        message: mapAuthErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isInitializing) {
    return (
      <Screen contentContainerStyle={styles.centerContainer}>
        <LoadingState message="Validando link de recuperação..." />
      </Screen>
    );
  }

  if (sessionError || !hasValidSession) {
    return (
      <Screen contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.errorIconBadge}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
          </View>
          <Text style={styles.cardTitle}>Link inválido ou expirado</Text>
          <Text style={styles.cardSubtitle}>
            {sessionError ??
              'Este link de redefinição de senha já foi utilizado ou expirou. Por favor, solicite um novo link.'}
          </Text>

          <PrimaryButton
            label="Solicitar novo link"
            onPress={() => router.replace('/(auth)/forgot-password')}
            iconName="mail-outline"
          />

          <View style={{ marginTop: spacing.md }}>
            <SecondaryButton
              label="Voltar para o login"
              onPress={() => router.replace('/(auth)/login')}
              iconName="arrow-back-outline"
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding contentContainerStyle={styles.container}>
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <Ionicons name="key-outline" size={32} color={colors.white} />
        </View>
        <Text style={styles.brandName}>Criar nova senha</Text>
        <Text style={styles.brandTagline}>
          Defina sua nova credencial segura para acessar sua conta.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nova senha</Text>
        <Text style={styles.cardSubtitle}>
          Digite e confirme sua nova senha com no mínimo 8 caracteres.
        </Text>

        <FormField
          label="Nova senha"
          placeholder="Digite a nova senha (mínimo 8 dígitos)"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password-new"
          leftIcon="lock-closed-outline"
          isPassword
          value={password}
          onChangeText={setPassword}
          errorMessage={fieldErrors.password}
          editable={!isSubmitting}
        />

        <FormField
          label="Confirme a nova senha"
          placeholder="Repita a nova senha"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password-new"
          leftIcon="shield-checkmark-outline"
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          errorMessage={fieldErrors.confirmPassword}
          editable={!isSubmitting}
        />

        <PrimaryButton
          label="Salvar nova senha"
          onPress={() => {
            void handleResetPassword();
          }}
          loading={isSubmitting}
          iconName="checkmark-circle-outline"
        />

        <View style={{ marginTop: spacing.md }}>
          <SecondaryButton
            label="Cancelar e voltar ao login"
            onPress={() => router.replace('/(auth)/login')}
            disabled={isSubmitting}
            iconName="arrow-back-outline"
          />
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  errorIconBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.cardLg,
    backgroundColor: colors.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
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
});
