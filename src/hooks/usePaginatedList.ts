import { useCallback, useEffect, useRef, useState } from 'react';

export interface PaginatedFetchParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginatedFetchResult<T> {
  items: T[];
  totalCount: number;
}

export interface UsePaginatedListOptions<T> {
  fetchPage: (params: PaginatedFetchParams) => Promise<PaginatedFetchResult<T>>;
  pageSize?: number;
  dependencies?: readonly unknown[];
  enabled?: boolean;
}

export interface UsePaginatedListReturn<T> {
  items: T[];
  totalCount: number;
  displayedCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  errorMessage: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
}

export function usePaginatedList<T>({
  fetchPage,
  pageSize = 20,
  dependencies = [],
  enabled = true,
}: UsePaginatedListOptions<T>): UsePaginatedListReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guarda a função de busca mais recente em ref para não recriar efeitos por re-render
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  // Guarda sequência de requisição para evitar race conditions
  const requestSeqRef = useRef<number>(0);
  const isLoadingMoreRef = useRef<boolean>(false);
  const hasMoreRef = useRef<boolean>(false);

  const hasMore = items.length < totalCount;
  hasMoreRef.current = hasMore;

  // Serializa dependências em string estável para evitar loop por recriação de array [a, b, c]
  const depsKey = JSON.stringify(dependencies);

  const loadInitial = useCallback(
    async (isPullRefresh: boolean = false) => {
      if (!enabled) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const seq = ++requestSeqRef.current;

      if (isPullRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const result = await fetchPageRef.current({
          page: 1,
          pageSize,
          offset: 0,
        });

        // Ignora respostas desatualizadas se outra busca tiver iniciado
        if (seq !== requestSeqRef.current) {
          return;
        }

        setItems(result.items);
        setTotalCount(result.totalCount);
        setCurrentPage(1);
      } catch (error) {
        if (seq !== requestSeqRef.current) {
          return;
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Erro ao carregar dados da lista.',
        );
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [enabled, pageSize],
  );

  // Dispara apenas quando depsKey (valores reais), enabled ou pageSize mudarem
  useEffect(() => {
    void loadInitial(false);
  }, [depsKey, loadInitial]);

  const refresh = useCallback(async () => {
    await loadInitial(true);
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (
      !enabled ||
      isLoading ||
      isLoadingMoreRef.current ||
      isRefreshing ||
      !hasMoreRef.current
    ) {
      return;
    }

    const nextPage = currentPage + 1;
    const offset = items.length;
    const seq = ++requestSeqRef.current;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const result = await fetchPageRef.current({
        page: nextPage,
        pageSize,
        offset,
      });

      if (seq !== requestSeqRef.current) {
        return;
      }

      setItems((prev) => [...prev, ...result.items]);
      setTotalCount(result.totalCount);
      setCurrentPage(nextPage);
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return;
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar mais itens.',
      );
    } finally {
      if (seq === requestSeqRef.current) {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [currentPage, enabled, isRefreshing, isLoading, items.length, pageSize]);

  return {
    items,
    totalCount,
    displayedCount: items.length,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    errorMessage,
    refresh,
    loadMore,
    setItems,
  };
}
