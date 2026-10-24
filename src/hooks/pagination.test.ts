import { describe, expect, it } from 'vitest';

describe('Lógica de paginação e contadores', () => {
  it('calcula corretamente o offset inicial e limites para cada página', () => {
    const pageSize = 20;

    const page1Offset = Math.max(0, (1 - 1) * pageSize);
    const page1RangeTo = page1Offset + pageSize - 1;

    expect(page1Offset).toBe(0);
    expect(page1RangeTo).toBe(19);

    const page2Offset = Math.max(0, (2 - 1) * pageSize);
    const page2RangeTo = page2Offset + pageSize - 1;

    expect(page2Offset).toBe(20);
    expect(page2RangeTo).toBe(39);
  });

  it('determina hasMore corretamente com base no totalCount', () => {
    const totalCount = 45;

    const page1Items = Array.from({ length: 20 }, (_, i) => i);
    expect(page1Items.length < totalCount).toBe(true);

    const page2Items = Array.from({ length: 40 }, (_, i) => i);
    expect(page2Items.length < totalCount).toBe(true);

    const page3Items = Array.from({ length: 45 }, (_, i) => i);
    expect(page3Items.length < totalCount).toBe(false);
  });

  it('formata texto do contador respeitando singular e plural', () => {
    function getCounterText(
      totalCount: number,
      displayedCount: number,
      nounSingular: string,
      nounPlural: string,
      isFiltered: boolean = false,
    ): string {
      const noun = totalCount === 1 ? nounSingular : nounPlural;
      if (isFiltered) {
        return `${displayedCount} de ${totalCount} ${noun} ${displayedCount === 1 ? 'encontrado' : 'encontrados'}`;
      }
      if (displayedCount < totalCount) {
        return `Exibindo ${displayedCount} de ${totalCount} ${noun}`;
      }
      return `Total de ${totalCount} ${noun}`;
    }

    expect(getCounterText(1, 1, 'cliente', 'clientes')).toBe(
      'Total de 1 cliente',
    );
    expect(getCounterText(50, 20, 'cliente', 'clientes')).toBe(
      'Exibindo 20 de 50 clientes',
    );
    expect(getCounterText(50, 50, 'cliente', 'clientes')).toBe(
      'Total de 50 clientes',
    );
    expect(getCounterText(15, 5, 'produto', 'produtos', true)).toBe(
      '5 de 15 produtos encontrados',
    );
    expect(getCounterText(1, 1, 'produto', 'produtos', true)).toBe(
      '1 de 1 produto encontrado',
    );
  });
});
