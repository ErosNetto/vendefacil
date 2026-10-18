import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { fetchUserProfile, signOutUser } from '@/features/auth/services';
import { fetchUserWorkspaces } from '@/features/workspace/services';
import {
  registerSupabaseAutoRefresh,
  supabase,
  supabaseEnvStatus,
} from '@/lib/supabase';
import type { ProfileRow, WorkspaceMembershipSummary } from '@/types/database';

export interface SessionContextValue {
  isConfigured: boolean;
  configReason: string | null;
  hasForbiddenKey: boolean;
  isLoadingSession: boolean;
  isLoadingWorkspaces: boolean;
  workspaceError: string | null;
  session: Session | null;
  profile: ProfileRow | null;
  workspaces: WorkspaceMembershipSummary[];
  activeWorkspace: WorkspaceMembershipSummary | null;
  refreshWorkspaceContext: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMembershipSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(
    supabaseEnvStatus.isConfigured,
  );
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState<boolean>(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const loadUserWorkspaceData = useCallback(async (userId: string) => {
    setIsLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const [userProfile, userWorkspaces] = await Promise.all([
        fetchUserProfile(userId),
        fetchUserWorkspaces(userId),
      ]);
      setProfile(userProfile);
      setWorkspaces(userWorkspaces);
      setSelectedWorkspaceId((currentId) => {
        if (currentId && userWorkspaces.some((w) => w.workspace.id === currentId)) {
          return currentId;
        }
        return userWorkspaces[0]?.workspace.id ?? null;
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar os dados do seu espaço de trabalho.';
      setWorkspaceError(
        message.includes('relation') || message.includes('does not exist')
          ? 'As tabelas do banco de dados ainda não foram criadas. Execute a migração SQL da Fase 1 no Supabase.'
          : 'Não foi possível carregar seu espaço de trabalho. Verifique sua conexão e se a migração SQL da Fase 1 foi aplicada.',
      );
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    registerSupabaseAutoRefresh();

    if (!supabaseEnvStatus.isConfigured) {
      setIsLoadingSession(false);
      return;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) {
          return;
        }
        setSession(data.session);
        setIsLoadingSession(false);
        if (data.session?.user.id) {
          void loadUserWorkspaceData(data.session.user.id);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingSession(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }
      setSession(nextSession);
      if (nextSession?.user.id) {
        void loadUserWorkspaceData(nextSession.user.id);
      } else {
        setProfile(null);
        setWorkspaces([]);
        setSelectedWorkspaceId(null);
        setWorkspaceError(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserWorkspaceData]);

  const refreshWorkspaceContext = useCallback(async () => {
    if (!session?.user.id) {
      return;
    }
    await loadUserWorkspaceData(session.user.id);
  }, [loadUserWorkspaceData, session?.user.id]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
    setSession(null);
    setProfile(null);
    setWorkspaces([]);
    setSelectedWorkspaceId(null);
  }, []);

  const activeWorkspace = useMemo(() => {
    if (workspaces.length === 0) {
      return null;
    }
    if (selectedWorkspaceId) {
      const found = workspaces.find((item) => item.workspace.id === selectedWorkspaceId);
      if (found) {
        return found;
      }
    }
    return workspaces[0] ?? null;
  }, [selectedWorkspaceId, workspaces]);

  const value = useMemo<SessionContextValue>(
    () => ({
      isConfigured: supabaseEnvStatus.isConfigured,
      configReason: supabaseEnvStatus.reason,
      hasForbiddenKey: supabaseEnvStatus.hasForbiddenKey,
      isLoadingSession,
      isLoadingWorkspaces,
      workspaceError,
      session,
      profile,
      workspaces,
      activeWorkspace,
      refreshWorkspaceContext,
      selectWorkspace,
      signOut,
    }),
    [
      activeWorkspace,
      isLoadingSession,
      isLoadingWorkspaces,
      profile,
      refreshWorkspaceContext,
      selectWorkspace,
      session,
      signOut,
      workspaceError,
      workspaces,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession deve ser utilizado dentro de um SessionProvider.');
  }
  return ctx;
}
