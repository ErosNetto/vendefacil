import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  FormField,
  PrimaryButton,
  Screen,
  SecondaryButton,
  useToast,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  forgotPasswordSchema,
  mapAuthErrorMessage,
} from '@/features/auth/schemas';
import { requestPasswordReset } from '@/features/auth/services';
import { useSession } from '@/features/auth/SessionProvider';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { isConfigured } = useSession();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleSendResetLink(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: issues.email?.[0] });
      showToast({
        tone: 'warning',
        title: 'Revise os dados',
        message: 'Informe um e-mail válido.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(parsed.data.email);
      setEmailSent(true);
      showToast({
        tone: 'success',
        title: 'E-mail enviado',
        message: 'Verifique sua caixa de entrada para criar uma nova senha.',
      });
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'Não foi possível enviar',
        message: mapAuthErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen keyboardAvoiding contentContainerStyle={styles.container}>
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <Ionicons name="mail-unread-outline" size={32} color={colors.white} />
        </View>
        <Text style={styles.brandName}>Recuperar acesso</Text>
        <Text style={styles.brandTagline}>
          Enviaremos um link de recuperação diretamente para seu e-mail.
        </Text>
      </View>

      <View style={styles.card}>
        {emailSent ? (
          <View>
            <View style={styles.successIconBadge}>
              <Ionicons
                name="checkmark-circle-outline"
                size={40}
                color={colors.primary}
              />
            </View>
            <Text style={styles.cardTitle}>E-mail enviado com sucesso!</Text>
            <Text style={styles.cardSubtitle}>
              Enviamos um link para <Text style={styles.highlightText}>{email}</Text>.
              Abra o e-mail no seu celular e toque no link para cadastrar sua nova senha.
            </Text>

            <PrimaryButton
              label="Voltar para o login"
              onPress={() => router.replace('/(auth)/login')}
              iconName="arrow-back-outline"
            />
          </View>
        ) : (
          <View>
            <Text style={styles.cardTitle}>Esqueceu sua senha?</Text>
            <Text style={styles.cardSubtitle}>
              Digite o e-mail associado à sua conta para receber as instruções de recuperação.
            </Text>

            <FormField
              label="E-mail cadastrado"
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

            <PrimaryButton
              label="Enviar link de recuperação"
              onPress={() => {
                void handleSendResetLink();
              }}
              loading={isSubmitting}
              disabled={!isConfigured}
              iconName="paper-plane-outline"
            />

            <View style={{ marginTop: spacing.md }}>
              <SecondaryButton
                label="Voltar para o login"
                onPress={() => router.replace('/(auth)/login')}
                disabled={isSubmitting}
                iconName="arrow-back-outline"
              />
            </View>
          </View>
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
  successIconBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.cardLg,
    backgroundColor: colors.primarySoft,
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
  highlightText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
});
