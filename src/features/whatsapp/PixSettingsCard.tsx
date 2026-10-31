import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FormField,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  formatPixBlockForWhatsApp,
  hasConfiguredPix,
  maskPixKeyInput,
  PIX_KEY_TYPE_OPTIONS,
  validatePixSettingsInput,
} from '@/features/whatsapp/schemas';
import {
  saveWorkspacePixSettings,
  useWorkspacePixSettings,
} from '@/features/whatsapp/services';
import type { PixKeyType, WorkspaceRow } from '@/types/database';

export interface PixSettingsCardProps {
  workspace: WorkspaceRow;
  onUpdated?: () => Promise<void> | void;
}

const KEY_PLACEHOLDERS: Record<PixKeyType, string> = {
  cpf_cnpj: 'Ex.: 123.456.789-00 ou 12.345.678/0001-90',
  phone: 'Ex.: (41) 99999-9999',
  email: 'Ex.: financeiro@sualoja.com.br',
  random: 'Ex.: 00000000-0000-0000-0000-000000000000',
};

export function PixSettingsCard({
  workspace,
  onUpdated,
}: PixSettingsCardProps) {
  const { pixSettings, refreshPixSettings } = useWorkspacePixSettings(workspace);

  const [pixKeyType, setPixKeyType] = useState<PixKeyType>(
    pixSettings.pixKeyType,
  );
  const [pixKeyInput, setPixKeyInput] = useState(pixSettings.pixKey);
  const [pixBankInput, setPixBankInput] = useState(pixSettings.pixBankName);
  const [pixHolderInput, setPixHolderInput] = useState(
    pixSettings.pixHolderName,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setPixKeyType(pixSettings.pixKeyType);
    setPixKeyInput(pixSettings.pixKey);
    setPixBankInput(pixSettings.pixBankName);
    setPixHolderInput(pixSettings.pixHolderName);
  }, [
    pixSettings.pixKeyType,
    pixSettings.pixKey,
    pixSettings.pixBankName,
    pixSettings.pixHolderName,
  ]);

  const isConfigured = hasConfiguredPix(pixSettings);

  const previewText = formatPixBlockForWhatsApp({
    pixKeyType,
    pixKey: pixKeyInput,
    pixBankName: pixBankInput,
    pixHolderName: pixHolderInput,
  });

  async function handleSave(clearAll = false): Promise<void> {
    if (isSaving) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    const validation = validatePixSettingsInput({
      pixKeyType,
      pixKeyInput: clearAll ? '' : pixKeyInput,
      pixBankNameInput: clearAll ? '' : pixBankInput,
      pixHolderNameInput: clearAll ? '' : pixHolderInput,
    });

    if (!validation.success || !validation.payload) {
      setErrorMessage(
        validation.errorMessage ?? 'Revise os dados PIX informados.',
      );
      return;
    }

    setIsSaving(true);
    try {
      await saveWorkspacePixSettings({
        workspaceId: workspace.id,
        settings: validation.payload,
      });
      await refreshPixSettings();
      if (onUpdated) {
        await onUpdated();
      }

      if (clearAll || !validation.payload.pixKey) {
        setPixKeyInput('');
        setPixBankInput('');
        setPixHolderInput('');
        setSuccessMessage('Dados PIX removidos com sucesso.');
      } else {
        setSuccessMessage(
          'Dados PIX salvos! Eles serão incluídos automaticamente nas cobranças e orçamentos via WhatsApp.',
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar os dados PIX.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleCol}>
          <View style={styles.titleWithIcon}>
            <Ionicons name="logo-whatsapp" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>PIX para cobrança no WhatsApp</Text>
          </View>
          <Text style={styles.subtitle}>
            Cadastre sua chave PIX, banco e nome do titular para enviar
            automaticamente junto aos lembretes de vencimento, cobranças em
            atraso e orçamentos.
          </Text>
        </View>
        <StatusBadge
          label={isConfigured ? 'Configurado' : 'Opcional'}
          tone={isConfigured ? 'success' : 'neutral'}
        />
      </View>

      <View style={styles.typeSection}>
        <Text style={styles.fieldLabel}>Tipo da chave PIX</Text>
        <View style={styles.chipsRow}>
          {PIX_KEY_TYPE_OPTIONS.map((option) => {
            const selected = option.key === pixKeyType;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setPixKeyType(option.key);
                  setPixKeyInput((prev) => maskPixKeyInput(prev, option.key));
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                style={[styles.typeChip, selected ? styles.typeChipActive : null]}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    selected ? styles.typeChipTextActive : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FormField
        label="Chave PIX"
        placeholder={KEY_PLACEHOLDERS[pixKeyType]}
        value={pixKeyInput}
        autoCapitalize="none"
        keyboardType={
          pixKeyType === 'cpf_cnpj'
            ? 'number-pad'
            : pixKeyType === 'phone'
              ? 'phone-pad'
              : pixKeyType === 'email'
                ? 'email-address'
                : 'default'
        }
        onChangeText={(val) => {
          setPixKeyInput(maskPixKeyInput(val, pixKeyType));
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      <View style={styles.twoCols}>
        <View style={styles.col}>
          <FormField
            label="Banco / Instituição"
            placeholder="Ex.: Nubank, Inter, Itaú"
            value={pixBankInput}
            onChangeText={(val) => {
              setPixBankInput(val);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
        </View>

        <View style={styles.col}>
          <FormField
            label="Nome no banco (Titular)"
            placeholder="Ex.: Nome do recebedor"
            value={pixHolderInput}
            onChangeText={(val) => {
              setPixHolderInput(val);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
        </View>
      </View>

      {previewText ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewHeader}>
            Prévia de como vai aparecer no WhatsApp do cliente:
          </Text>
          <Text style={styles.previewContent}>{previewText}</Text>
        </View>
      ) : null}

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

      <View style={styles.actionsCol}>
        <PrimaryButton
          label="Salvar dados PIX"
          iconName="checkmark-circle-outline"
          loading={isSaving}
          onPress={() => {
            void handleSave(false);
          }}
        />
        {isConfigured ? (
          <SecondaryButton
            label="Remover chave PIX"
            iconName="trash-outline"
            disabled={isSaving}
            onPress={() => {
              void handleSave(true);
            }}
          />
        ) : null}
      </View>
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
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  typeSection: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  typeChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  twoCols: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  col: {
    flex: 1,
  },
  previewBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.xs,
  },
  previewHeader: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  previewContent: {
    ...typography.caption,
    color: colors.text,
    lineHeight: 18,
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
  actionsCol: {
    gap: spacing.xs,
  },
});
