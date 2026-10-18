import { LoadingState, Screen } from '@/components/ui';

export default function IndexScreen() {
  return (
    <Screen scroll={false}>
      <LoadingState message="Iniciando o VendeFácil..." />
    </Screen>
  );
}
