const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Converte um valor em centavos inteiros para string formatada em BRL (ex.: 12990 -> "R$ 129,90").
 * Rejeita NaN/Infinity retornando "R$ 0,00" de forma segura.
 */
export function formatCentsToBRL(cents: number): string {
  if (!Number.isFinite(cents)) {
    return brlFormatter.format(0);
  }
  const integerCents = Math.round(cents);
  return brlFormatter.format(integerCents / 100);
}

/**
 * Faz o parse de um texto digitado pelo usuário (ex.: "129,90" ou "R$ 1.250,50")
 * para centavos inteiros sem imprecisão de ponto flutuante.
 */
export function parseBRLInputToCents(raw: string): number | null {
  const cleaned = raw
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  if (!cleaned || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const [wholePart = '0', decimalPart = ''] = cleaned.split('.');
  const isNegative = wholePart.startsWith('-');
  const absWhole = Math.abs(parseInt(wholePart, 10));
  const paddedDecimal = (decimalPart + '00').slice(0, 2);
  const cents = absWhole * 100 + parseInt(paddedDecimal, 10);

  return isNegative ? -cents : cents;
}

/**
 * Formata uma data ISO (`YYYY-MM-DD` ou timestamp ISO) no padrão brasileiro `dd/MM/yyyy`.
 * Datas puras (`YYYY-MM-DD`) são formatadas sem conversão de fuso horário para evitar
 * deslocamento de -1 dia no fuso de Brasília.
 */
export function formatDateBR(value: string | Date): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return `${day}/${month}/${year}`;
    }
  }

  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) {
    return '--/--/----';
  }

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = String(dateObj.getFullYear());
  return `${day}/${month}/${year}`;
}

/**
 * Formata um timestamp ISO no padrão brasileiro `dd/MM/yyyy às HH:mm`.
 */
export function formatDateTimeBR(value: string | Date): string {
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) {
    return '--/--/----';
  }

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = String(dateObj.getFullYear());
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}

/**
 * Distribui um total em centavos inteiros em N parcelas sem perder nem criar centavos.
 * Os centavos residuais da divisão são alocados nas primeiras parcelas.
 */
export function distributeCentsAcrossInstallments(
  totalCents: number,
  installmentCount: number,
): number[] {
  const roundedTotal = Math.round(totalCents);
  const count = Math.trunc(installmentCount);

  if (!Number.isFinite(roundedTotal) || roundedTotal < 0) {
    throw new Error('O valor total em centavos deve ser um inteiro não negativo.');
  }

  if (!Number.isFinite(count) || count < 1 || count > 120) {
    throw new Error('A quantidade de parcelas deve estar entre 1 e 120.');
  }

  const baseInstallment = Math.floor(roundedTotal / count);
  const remainder = roundedTotal % count;

  return Array.from({ length: count }, (_, index) =>
    index < remainder ? baseInstallment + 1 : baseInstallment,
  );
}
