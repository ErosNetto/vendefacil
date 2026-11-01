import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentRef } from 'react';
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
  FilterChips,
  FormField,
  LoadingState,
  PrimaryButton,
  Screen,
  useScrollToTop,
  useToast,
} from '@/components/ui';
import { colors, spacing, typography } from '@/constants/theme';
import { useSession } from '@/features/auth/SessionProvider';
import {
  expenseFormSchema,
  normalizeExpensePayload,
  type ExpenseFormInput,
} from '@/features/expenses/schemas';
import {
  createWorkspaceExpense,
  listWorkspaceExpenseCategories,
} from '@/features/expenses/services';
import {
  PAYMENT_METHOD_OPTIONS,
  parseBRDateInputToISO,
} from '@/features/finance/schemas';
import type { ExpenseCategoryRow, PaymentMethod } from '@/types/database';
import { formatDateBR, maskBRLCurrencyInput } from '@/utils/formatters';

export default function NewExpenseScreen() {
  const router = useRouter();
  const { activeWorkspace } = useSession();
  const { showToast } = useToast();
  const workspaceId = activeWorkspace?.workspace.id ?? null;

  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

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

  useEffect(() => {
    async function loadCategories() {
      if (!workspaceId) return;
      try {
        const list = await listWorkspaceExpenseCategories(workspaceId);
        setCategories(list);
        if (list.length > 0 && !selectedCategoryId) {
          setSelectedCategoryId(list[0]?.id ?? null);
        }
      } catch {
        // Ignora falha de categorias
      } finally {
        setIsLoadingCategories(false);
      }
    }
    void loadCategories();
  }, [workspaceId]);

  const handleAmountChange = useCallback((text: string) => {
    setAmountInput(maskBRLCurrencyInput(text));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.amountInput;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!workspaceId || isSubmitting) return;

    setFieldErrors({});

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
      showToast({
        tone: 'warning',
        title: 'Revise os dados da despesa',
        message: 'Preencha a descrição, valor e data corretamente.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = normalizeExpensePayload(parseResult.data);
      await createWorkspaceExpense(workspaceId, payload);
      showToast({
        tone: 'success',
        title: 'Despesa registrada!',
        message: `${description} (${amountInput}) lançada no caixa.`,
      });
      router.back();
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'Erro ao registrar despesa',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível registrar a despesa.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    workspaceId,
    isSubmitting,
    description,
    amountInput,
    expenseDateBR,
    selectedCategoryId,
    paymentMethod,
    notes,
    router,
    showToast,
  ]);

  const categoryChips = categories.map((cat) => ({
    key: cat.id,
    label: cat.name,
  }));

  const { scrollRef, showScrollToTop, handleScroll, scrollToTop } =
    useScrollToTop<ComponentRef<typeof ScrollView>>();

  const paymentMethodChips = PAYMENT_METHOD_OPTIONS.map((opt) => ({
    key: opt.value,
    label: opt.label,
  }));

  return (
    <Screen
      scroll={false}
      showScrollToTop={showScrollToTop}
      onScrollToTop={scrollToTop}
    >
      <AppHeader
        title="Nova despesa"
        subtitle={activeWorkspace?.workspace.name ?? 'Registro de saída'}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          ref={scrollRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
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
            {isLoadingCategories ? (
              <LoadingState message="Carregando categorias..." />
            ) : (
              <FilterChips
                options={categoryChips}
                selectedKey={selectedCategoryId ?? ''}
                onSelect={setSelectedCategoryId}
              />
            )}
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
              label={isSubmitting ? 'Salvando...' : 'Salvar despesa'}
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
