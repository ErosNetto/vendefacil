import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing, touchTarget, typography } from '@/constants/theme';
import { maskDateBR } from '@/utils/formatters';

const MONTH_NAMES_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_NAMES_PT_BR = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export interface DatePickerFieldProps {
  label: string;
  value: string; // formato "dd/MM/yyyy"
  onChangeDate: (dateBR: string) => void;
  helperText?: string;
  errorMessage?: string | null;
  editable?: boolean;
}

function parseBRDateToDateObj(brDate: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brDate.trim());
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const d = new Date(year, month, day);
  if (
    d.getFullYear() === year &&
    d.getMonth() === month &&
    d.getDate() === day
  ) {
    return d;
  }
  return null;
}

function formatDateObjToBR(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  return `${day}/${month}/${year}`;
}

export function DatePickerField({
  label,
  value,
  onChangeDate,
  helperText,
  errorMessage,
  editable = true,
}: DatePickerFieldProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const parsedCurrent = useMemo(
    () => parseBRDateToDateObj(value) ?? new Date(),
    [value],
  );

  const [viewYear, setViewYear] = useState<number>(parsedCurrent.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedCurrent.getMonth());
  const [tempSelectedDate, setTempSelectedDate] = useState<Date>(parsedCurrent);

  function handleOpenCalendar(): void {
    if (!editable) {
      return;
    }
    const currentObj = parseBRDateToDateObj(value) ?? new Date();
    setViewYear(currentObj.getFullYear());
    setViewMonth(currentObj.getMonth());
    setTempSelectedDate(currentObj);
    setIsCalendarOpen(true);
  }

  function handlePrevMonth(): void {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  }

  function handleNextMonth(): void {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  }

  function handleQuickSelect(offsetDays: number): void {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setTempSelectedDate(d);
  }

  function handleConfirmCalendar(): void {
    onChangeDate(formatDateObjToBR(tempSelectedDate));
    setIsCalendarOpen(false);
  }

  // Gera dias do mês em exibição
  const daysInMonth = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(day);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const hasError = Boolean(errorMessage);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.inputContainer, hasError ? styles.inputError : null]}>
        <TextInput
          value={value}
          onChangeText={(raw) => onChangeDate(maskDateBR(raw))}
          placeholder="dd/MM/yyyy"
          placeholderTextColor={colors.textSecondary}
          keyboardType="numeric"
          maxLength={10}
          editable={editable}
          accessibilityLabel={label}
          style={styles.input}
        />
        {editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir calendário"
            onPress={handleOpenCalendar}
            hitSlop={8}
            style={styles.calendarIconBtn}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
        <View style={styles.errorRow}>
          <Ionicons
            name="alert-circle-outline"
            size={15}
            color={colors.error}
          />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}

      {/* Modal de Calendário Interativo */}
      <Modal
        visible={isCalendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCalendarOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarCard}>
            {/* Cabeçalho do Mês */}
            <View style={styles.calendarHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mês anterior"
                onPress={handlePrevMonth}
                style={styles.monthNavBtn}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={colors.text}
                />
              </Pressable>

              <Text style={styles.monthTitle}>
                {MONTH_NAMES_PT_BR[viewMonth]} de {viewYear}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Próximo mês"
                onPress={handleNextMonth}
                style={styles.monthNavBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.text}
                />
              </Pressable>
            </View>

            {/* Atalhos Rápidos */}
            <View style={styles.shortcutsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleQuickSelect(0)}
                style={styles.shortcutChip}
              >
                <Text style={styles.shortcutChipText}>Hoje</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleQuickSelect(15)}
                style={styles.shortcutChip}
              >
                <Text style={styles.shortcutChipText}>+15 dias</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleQuickSelect(30)}
                style={styles.shortcutChip}
              >
                <Text style={styles.shortcutChipText}>+30 dias</Text>
              </Pressable>
            </View>

            {/* Cabeçalho dos Dias da Semana */}
            <View style={styles.weekdaysRow}>
              {WEEKDAY_NAMES_PT_BR.map((w, index) => (
                <Text key={index} style={styles.weekdayText}>
                  {w}
                </Text>
              ))}
            </View>

            {/* Grade de Dias */}
            <View style={styles.daysGrid}>
              {daysInMonth.map((dayNum, index) => {
                if (dayNum === null) {
                  return <View key={`empty-${index}`} style={styles.dayCell} />;
                }

                const isSelected =
                  tempSelectedDate.getDate() === dayNum &&
                  tempSelectedDate.getMonth() === viewMonth &&
                  tempSelectedDate.getFullYear() === viewYear;

                const isToday =
                  new Date().getDate() === dayNum &&
                  new Date().getMonth() === viewMonth &&
                  new Date().getFullYear() === viewYear;

                return (
                  <Pressable
                    key={`day-${dayNum}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      setTempSelectedDate(
                        new Date(viewYear, viewMonth, dayNum),
                      );
                    }}
                    style={[
                      styles.dayCell,
                      styles.dayCellActive,
                      isSelected ? styles.dayCellSelected : null,
                      !isSelected && isToday ? styles.dayCellToday : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayCellText,
                        isSelected ? styles.dayCellTextSelected : null,
                        !isSelected && isToday ? styles.dayCellTextToday : null,
                      ]}
                    >
                      {dayNum}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Rodapé com Data Selecionada e Ações */}
            <View style={styles.calendarFooter}>
              <View style={styles.selectedDatePreview}>
                <Text style={styles.selectedDateLabel}>Selecionada:</Text>
                <Text style={styles.selectedDateValue}>
                  {formatDateObjToBR(tempSelectedDate)}
                </Text>
              </View>

              <View style={styles.footerButtonsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsCalendarOpen(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={handleConfirmCalendar}
                  style={styles.confirmBtn}
                >
                  <Text style={styles.confirmBtnText}>Confirmar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    minHeight: touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  inputError: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  calendarIconBtn: {
    padding: spacing.xs,
    marginLeft: 2,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
  monthTitle: {
    ...typography.section,
    color: colors.text,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  shortcutChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  shortcutChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingHorizontal: 2,
  },
  weekdayText: {
    width: 38,
    textAlign: 'center',
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 4,
    marginVertical: spacing.xs,
  },
  dayCell: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  dayCellActive: {
    backgroundColor: colors.background,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dayCellText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  dayCellTextSelected: {
    color: colors.white,
    fontWeight: '700',
  },
  dayCellTextToday: {
    color: colors.primary,
  },
  calendarFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  selectedDatePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedDateLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  selectedDateValue: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  footerButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.control,
  },
  cancelBtnText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.control,
  },
  confirmBtnText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
});
