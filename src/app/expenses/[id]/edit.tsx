import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppHeader,
  DatePickerField,
  ErrorState,
  FilterChips,
  FormField,
  LoadingState,
  PrimaryButton,
  Screen,
} from '@/components/ui';
import { colors, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  expenseFormSchema,
  normalizeExpensePayload,
  type ExpenseFormInput,
} from '@/features/expenses/schemas';
import {
  getWorkspaceExpenseById,
  listWorkspaceExpenseCategories,
  updateWorkspaceExpense,
} from '@/features/expenses/services';
import {
  PAYMENT_METHOD_OPTIONS,
  parseBRDateInputToISO,
} from '@/features/finance/schemas';
import type { ExpenseCategoryRow, PaymentMethod } from '@/types/database';
import { formatDateBR, maskBRLCurrencyInput } from '@/utils/formatters';

export default function EditExpenseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [expenseDateBR, setExpenseDateBR] = useState(() =>
    formatDateBR(new Date()),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    if (!workspaceId || !id) return;
    try {
      setIsLoading(true);
      setLoadError(null);

      const [expense, cats] = await Promise.all([
        getWorkspaceExpenseById(workspaceId, id),
        listWorkspaceExpenseCategories(workspaceId),
      ]);

      if (!expense) {
        setLoadError('Despesa não encontrada.');
        return;
      }

      setCategories(cats);
      setDescription(expense.description);
      setAmountInput((expense.amount_cents / 100).toFixed(2).replace('.', ','));
      setExpenseDateBR(formatDateBR(expense.expense_date));
      setSelectedCategoryId(expense.category_id);
      setPaymentMethod(expense.payment_method);
      setNotes(expense.notes ?? '');
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Falha ao carregar dados da despesa.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, id]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const handleAmountChange = useCallback((text: string) => {
    setAmountInput(maskBRLCurrencyInput(text));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.amountInput;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!workspaceId || !id || isSubmitting) return;

    setFieldErrors({});
    setGeneralError(null);

    const expenseDate = parseBRDateInputToISO(expenseDateBR) ?? '';

    const rawValues: ExpenseFormInput = {
      description,
      amountInput,
      expenseDate,
      categoryId: selectedCategoryId,
      paymentMethod,
      notes,
    };

    const parseResult = expenseFormSchema.safeParse(rawValues);
    if (!parseResult.success) {
      const errors: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        const key = issue.path[0];
        if (key && !errors[String(key)]) {
          errors[String(key)] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = normalizeExpensePayload(parseResult.data);
      await updateWorkspaceExpense({
        workspaceId,
        expenseId: id,
        payload,
      });
      router.back();
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a despesa.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    workspaceId,
    id,
    isSubmitting,
    description,
    amountInput,
    expenseDateBR,
    selectedCategoryId,
    paymentMethod,
    notes,
    router,
  ]);

  const categoryChips = categories.map((cat) => ({
    key: cat.id,
    label: cat.name,
  }));

  const paymentMethodChips = PAYMENT_METHOD_OPTIONS.map((opt) => ({
    key: opt.value,
    label: opt.label,
  }));

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <AppHeader title="Editar despesa" />
        <LoadingState message="Carregando dados da despesa..." />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen scroll={false}>
        <AppHeader title="Editar despesa" />
        <ErrorState
          title="Erro"
          message={loadError}
          onRetry={loadInitialData}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Editar despesa"
        subtitle={activeWorkspace?.workspace.name ?? 'Ajuste de registro'}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {generalError ? (
            <View style={styles.errorContainer}>
              <ErrorState
                title="Erro ao salvar"
                message={generalError}
                onRetry={handleSubmit}
              />
            </View>
          ) : null}

          <FormField
            label="Descrição da despesa *"
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.description;
                return next;
              });
            }}
            placeholder="Ex: Aluguel da loja, Conta de Luz, Embalagens..."
            errorMessage={fieldErrors.description}
          />

          <FormField
            label="Valor da despesa (R$) *"
            value={amountInput}
            onChangeText={handleAmountChange}
            placeholder="0,00"
            keyboardType="numeric"
            errorMessage={fieldErrors.amountInput}
          />

          <DatePickerField
            label="Data de pagamento *"
            value={expenseDateBR}
            onChangeDate={(date) => {
              setExpenseDateBR(date);
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.expenseDate;
                return next;
              });
            }}
            errorMessage={fieldErrors.expenseDate}
          />

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Categoria</Text>
            <FilterChips
              options={categoryChips}
              selectedKey={selectedCategoryId ?? ''}
              onSelect={setSelectedCategoryId}
            />
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Forma de pagamento</Text>
            <FilterChips
              options={paymentMethodChips}
              selectedKey={paymentMethod}
              onSelect={(key) => setPaymentMethod(key as PaymentMethod)}
            />
          </View>

          <FormField
            label="Observações (opcional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Número da nota fiscal, fornecedor, etc..."
            multiline
            numberOfLines={3}
            errorMessage={fieldErrors.notes}
          />

          <View style={styles.submitWrap}>
            <PrimaryButton
              label={isSubmitting ? 'Salvando...' : 'Salvar alterações'}
              iconName="checkmark-circle-outline"
              onPress={handleSubmit}
              disabled={isSubmitting}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  errorContainer: {
    marginBottom: spacing.xs,
  },
  sectionBlock: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  submitWrap: {
    marginTop: spacing.md,
  },
});
