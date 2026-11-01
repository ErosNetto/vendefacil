import type { Session, User } from '@supabase/supabase-js';

import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type { ProfileRow } from '@/types/database';

export interface AuthActionResult {
  user: User | null;
  session: Session | null;
  requiresEmailConfirmation: boolean;
}

function ensureSupabaseConfigured(): void {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error(
      supabaseEnvStatus.reason ??
        'O cliente Supabase ainda não está configurado no arquivo .env.',
    );
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  ensureSupabaseConfigured();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw error;
  }

  return {
    user: data.user,
    session: data.session,
    requiresEmailConfirmation: false,
  };
}

export async function signUpWithEmail(
  fullName: string,
  email: string,
  password: string,
): Promise<AuthActionResult> {
  ensureSupabaseConfigured();

  const cleanName = fullName.trim();
  const cleanEmail = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
      },
    },
  });

  if (error) {
    throw error;
  }

  return {
    user: data.user,
    session: data.session,
    requiresEmailConfirmation: Boolean(data.user && !data.session),
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  ensureSupabaseConfigured();

  const cleanEmail = email.trim().toLowerCase();
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: 'vendefacil://reset-password',
  });

  if (error) {
    throw error;
  }
}

export async function updateUserPassword(newPassword: string): Promise<void> {
  ensureSupabaseConfigured();

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw error;
  }
}

export async function setAuthSessionFromTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  ensureSupabaseConfigured();

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  if (!supabaseEnvStatus.isConfigured) {
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function fetchUserProfile(userId: string): Promise<ProfileRow | null> {
  if (!supabaseEnvStatus.isConfigured) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
