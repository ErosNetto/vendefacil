import { AppHeader, EmptyState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';

export default function ProductsScreen() {
  const { activeWorkspace } = useSession();

  return (
    <Screen>
      <AppHeader
        title="Catálogo de Produtos"
        subtitle={activeWorkspace?.workspace.name ?? 'Produtos e categorias'}
        showBack
      />
      <EmptyState
        iconName="pricetag-outline"
        title="Nenhum produto cadastrado"
        description="O catálogo com categorias, preços em centavos e fotos privadas no Supabase Storage será implementado na Fase 3 do plano."
      />
    </Screen>
  );
}
