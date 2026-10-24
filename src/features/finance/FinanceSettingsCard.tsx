import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FormField,
  PrimaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  getWorkspaceFinanceSettings,
  validateFinanceSettingsInput,
} from '@/features/finance/schemas';
import {
  mapFinanceServiceError,
  updateWorkspaceFinanceSettings,
} from '@/features/finance/services';
import type { WorkspaceRow } from '@/types/database';

export interface FinanceSettingsCardProps {
  workspace: WorkspaceRow;
  onUpdated: () => Promise<void> | void;
}

export function FinanceSettingsCard({
  workspace,
  onUpdated,
}: FinanceSettingsCardProps) {
  const currentSettings = getWorkspaceFinanceSettings(workspace);

  const [lateFeeEnabled, setLateFeeEnabled] = useState(
    currentSettings.lateFeeEnabled,
  );
  const [finePercentInput, setFinePercentInput] = useState(
    currentSettings.defaultFinePercent.toFixed(2).replace('.', ','),
  );
  const [monthlyInterestInput, setMonthlyInterestInput] = useState(
    currentSettings.defaultMonthlyInterestPercent.toFixed(2).replace('.', ','),
  );
  const [graceDaysInput, setGraceDaysInput] = useState(
    String(currentSettings.gracePeriodDays),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = getWorkspaceFinanceSettings(workspace);
    setLateFeeEnabled(next.lateFeeEnabled);
    setFinePercentInput(next.defaultFinePercent.toFixed(2).replace('.', ','));
    setMonthlyInterestInput(
      next.defaultMonthlyInterestPercent.toFixed(2).replace('.', ','),
    );
    setGraceDaysInput(String(next.gracePeriodDays));
  }, [
    workspace.default_fine_percent,
    workspace.default_monthly_interest_percent,
    workspace.grace_period_days,
    workspace.id,
    workspace.late_fee_enabled,
    workspace,
  ]);

  async function handleSave(): Promise<void> {
    if (isSaving) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    const validation = validateFinanceSettingsInput({
      lateFeeEnabled,
      finePercentInput,
      monthlyInterestPercentInput: monthlyInterestInput,
      gracePeriodDaysInput: graceDaysInput,
    });

    if (!validation.success || !validation.payload) {
      setErrorMessage(
        validation.errorMessage ?? 'Revise os parâmetros informados.',
      );
      return;
    }

    setIsSaving(true);
    try {
      await updateWorkspaceFinanceSettings({
        workspaceId: workspace.id,
        lateFeeEnabled: validation.payload.lateFeeEnabled,
        defaultFinePercent: validation.payload.defaultFinePercent,
        defaultMonthlyInterestPercent:
          validation.payload.defaultMonthlyInterestPercent,
        gracePeriodDays: validation.payload.gracePeriodDays,
      });

      await onUpdated();
      setSuccessMessage('Regras padrão de cobrança atualizadas com sucesso!');
    } catch (error) {
      setErrorMessage(mapFinanceServiceError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleCol}>
          <Text style={styles.sectionTitle}>Regras de cobrança e juros</Text>
          <Text style={styles.subtitle}>
            Padrão sugerido automaticamente ao receber parcelas vencidas (você
            ainda pode editar ou isentar na hora do recebimento).
          </Text>
        </View>
        <StatusBadge
          label={lateFeeEnabled ? 'Ativo' : 'Desativado'}
          tone={lateFeeEnabled ? 'success' : 'neutral'}
        />
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: lateFeeEnabled }}
        onPress={() => {
          setLateFeeEnabled((prev) => !prev);
          setSuccessMessage(null);
          setErrorMessage(null);
        }}
        style={[
          styles.toggleBox,
          lateFeeEnabled ? styles.toggleBoxActive : null,
        ]}
      >
        <View style={styles.toggleTextCol}>
          <Text style={styles.toggleTitle}>
            Sugerir multa e juros automaticamente em atrasos
          </Text>
          <Text style={styles.toggleDescription}>
            {lateFeeEnabled
              ? 'Parcelas vencidas fora da carência já abrem com multa e juros calculados.'
              : 'Parcelas vencidas abrem com multa e juros zerados por padrão.'}
          </Text>
        </View>
        <Ionicons
          name={lateFeeEnabled ? 'checkbox' : 'square-outline'}
          size={24}
          color={lateFeeEnabled ? colors.primary : colors.textSecondary}
        />
      </Pressable>

      <View style={styles.twoCols}>
        <View style={styles.col}>
          <FormField
            label="Multa fixa (%)"
            placeholder="2,00"
            keyboardType="decimal-pad"
            value={finePercentInput}
            onChangeText={(val) => {
              setFinePercentInput(val);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
        </View>
        <View style={styles.col}>
          <FormField
            label="Juros ao mês (%)"
            placeholder="1,00"
            keyboardType="decimal-pad"
            value={monthlyInterestInput}
            onChangeText={(val) => {
              setMonthlyInterestInput(val);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
        </View>
      </View>

      <FormField
        label="Dias de tolerância / carência sem juros"
        placeholder="0"
        keyboardType="number-pad"
        value={graceDaysInput}
        onChangeText={(val) => {
          setGraceDaysInput(val);
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
        helperText="Ex.: 0 cobra a partir de 1 dia de atraso; 3 só cobra a partir do 4º dia."
      />

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {successMessage ? (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      <PrimaryButton
        label="Salvar regras de cobrança"
        iconName="save-outline"
        loading={isSaving}
        onPress={() => {
          void handleSave();
        }}
      />
    </View>
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
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerTitleCol: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  toggleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  toggleBoxActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  toggleTextCol: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  toggleDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  twoCols: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  col: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.error,
    padding: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
  },
  successBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
  },
  successText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
});
