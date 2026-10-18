import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { colors, radius, spacing, typography } from '@/constants/theme';

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Carregando informações...' }: LoadingStateProps) {
  return (
    <View style={styles.centerBox} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.secondaryText}>{message}</Text>
    </View>
  );
}

export interface EmptyStateProps {
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function EmptyState({
  iconName = 'folder-open-outline',
  title,
  description,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Ionicons name={iconName} size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onActionPress ? (
        <View style={styles.buttonWrap}>
          <PrimaryButton label={actionLabel} onPress={onActionPress} />
        </View>
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Não foi possível concluir a operação',
  message,
  retryLabel = 'Tentar novamente',
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={[styles.card, styles.errorCard]} accessibilityRole="alert">
      <View style={[styles.iconCircle, styles.errorIconCircle]}>
        <Ionicons name="warning-outline" size={26} color={colors.error} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{message}</Text>
      {onRetry ? (
        <View style={styles.buttonWrap}>
          <SecondaryButton
            label={retryLabel}
            iconName="refresh-outline"
            onPress={onRetry}
          />
        </View>
      ) : null}
    </View>
  );
}

export interface SupabaseSetupNoticeProps {
  reason: string | null;
  hasForbiddenKey?: boolean;
}

export function SupabaseSetupNotice({
  reason,
  hasForbiddenKey = false,
}: SupabaseSetupNoticeProps) {
  return (
    <View
      style={[styles.setupNotice, hasForbiddenKey ? styles.errorCard : null]}
      accessibilityRole="alert"
    >
      <View style={styles.setupHeader}>
        <Ionicons
          name={hasForbiddenKey ? 'shield-outline' : 'construct-outline'}
          size={20}
          color={hasForbiddenKey ? colors.error : colors.warning}
        />
        <Text style={styles.setupTitle}>
          {hasForbiddenKey
            ? 'Alerta de segurança na configuração'
            : 'Configuração do Supabase pendente'}
        </Text>
      </View>
      <Text style={styles.setupBody}>
        {reason ??
          'Crie um arquivo .env na raiz do projeto com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.'}
      </Text>
      <Text style={styles.setupHint}>
        Copie o arquivo .env.example para .env, preencha com a URL e a chave pública (anon)
        do seu projeto Supabase e reinicie o servidor Expo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  errorCard: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorIconCircle: {
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.section,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  secondaryText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  buttonWrap: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  setupNotice: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setupTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    flex: 1,
  },
  setupBody: {
    ...typography.body,
    color: colors.text,
  },
  setupHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
