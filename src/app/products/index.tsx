import { EmptyState, Screen } from '@/components/ui';

export default function ProductsScreen() {
  return (
    <Screen>
      <EmptyState
        iconName="pricetag-outline"
        title="Nenhum produto cadastrado"
        description="O catálogo com categorias, preços em centavos e fotos privadas no Supabase Storage será implementado na Fase 3 do plano."
      />
    </Screen>
  );
}
