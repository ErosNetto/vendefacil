import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  FormField,
  PrimaryButton,
  SecondaryButton,
  useToast,
} from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import {
  customerFormSchema,
  formatPhoneBR,
  type CustomerFormInput,
} from '@/features/customers/schemas';

export interface CustomerFormProps {
  initialValues?: Partial<CustomerFormInput>;
  submitLabel: string;
  onSubmit: (values: CustomerFormInput) => Promise<void>;
  onCancel: () => void;
}

export function CustomerForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const [fullName, setFullName] = useState(initialValues?.fullName ?? '');
  const [phone, setPhone] = useState(initialValues?.phone ?? '');
  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [address, setAddress] = useState(initialValues?.address ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');

  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  function handlePhoneChange(nextValue: string): void {
    const digitsOnly = nextValue.replace(/\D/g, '');
    if (digitsOnly.length <= 11) {
      setPhone(formatPhoneBR(digitsOnly));
    } else {
      setPhone(nextValue.slice(0, 30));
    }
  }

  async function handleFormSubmit(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});

    const candidate: CustomerFormInput = {
      fullName,
      phone,
      email,
      address,
      notes,
    };

    const parsed = customerFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        fullName: issues.fullName?.[0],
        phone: issues.phone?.[0],
        email: issues.email?.[0],
        address: issues.address?.[0],
        notes: issues.notes?.[0],
      });
      showToast({
        tone: 'warning',
        title: 'Revise os dados do cliente',
        message: 'Preencha corretamente os campos obrigatórios.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(candidate);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar os dados do cliente.';
      showToast({
        tone: 'error',
        title: 'Erro ao salvar cliente',
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.card}>
      <FormField
        label="Nome completo *"
        placeholder="Ex.: Ana Souza"
        autoCapitalize="words"
        leftIcon="person-outline"
        value={fullName}
        onChangeText={setFullName}
        errorMessage={fieldErrors.fullName}
        editable={!isSubmitting}
      />

      <FormField
        label="Telefone / WhatsApp (opcional)"
        placeholder="(11) 98765-4321"
        keyboardType="phone-pad"
        leftIcon="call-outline"
        value={phone}
        onChangeText={handlePhoneChange}
        errorMessage={fieldErrors.phone}
        helperText="Digite apenas os números com DDD."
        editable={!isSubmitting}
      />

      <FormField
        label="E-mail (opcional)"
        placeholder="cliente@exemplo.com.br"
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
        label="Endereço de entrega / cobrança (opcional)"
        placeholder="Rua, número, bairro, complemento"
        leftIcon="location-outline"
        value={address}
        onChangeText={setAddress}
        errorMessage={fieldErrors.address}
        editable={!isSubmitting}
      />

      <FormField
        label="Observações (opcional)"
        placeholder="Preferências de produtos, melhor dia de cobrança..."
        leftIcon="document-text-outline"
        multiline
        numberOfLines={3}
        value={notes}
        onChangeText={setNotes}
        errorMessage={fieldErrors.notes}
        editable={!isSubmitting}
        style={styles.multilineInput}
      />

      <View style={styles.actionsColumn}>
        <PrimaryButton
          label={submitLabel}
          onPress={() => {
            void handleFormSubmit();
          }}
          loading={isSubmitting}
          iconName="checkmark-circle-outline"
        />

        <SecondaryButton
          label="Cancelar"
          onPress={onCancel}
          disabled={isSubmitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  actionsColumn: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});
