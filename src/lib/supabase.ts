import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { validateSupabaseEnv } from '@/lib/supabaseEnv';
import type { Database } from '@/types/database';

const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const rawAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/**
 * Adaptador de armazenamento seguro em blocos (chunked) para Expo SecureStore.
 * Evita falha de limite de 2048 bytes por item no Android/iOS quando o token JWT cresce.
 */
const CHUNK_SIZE = 1800;

const expoSecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
      return null;
    }

    const countStr = await SecureStore.getItemAsync(`${key}__chunks`);
    if (!countStr) {
      return SecureStore.getItemAsync(key);
    }

    const count = parseInt(countStr, 10);
    if (Number.isNaN(count) || count <= 0) {
      return null;
    }

    const chunks: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}__chunk_${i}`);
      if (part === null) {
        return null;
      }
      chunks.push(part);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
      return;
    }

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(`${key}__chunks`);
      return;
    }

    const totalChunks = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i += 1) {
      const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}__chunk_${i}`, slice);
    }
    await SecureStore.setItemAsync(`${key}__chunks`, String(totalChunks));
    await SecureStore.deleteItemAsync(key);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
      return;
    }

    const countStr = await SecureStore.getItemAsync(`${key}__chunks`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      if (!Number.isNaN(count)) {
        for (let i = 0; i < count; i += 1) {
          await SecureStore.deleteItemAsync(`${key}__chunk_${i}`);
        }
      }
      await SecureStore.deleteItemAsync(`${key}__chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabaseEnvStatus = validateSupabaseEnv(rawUrl, rawAnonKey);

const effectiveUrl = supabaseEnvStatus.isConfigured
  ? rawUrl
  : 'https://placeholder-unconfigured.supabase.co';
const effectiveAnonKey = supabaseEnvStatus.isConfigured
  ? rawAnonKey
  : 'placeholder-anon-key-not-configured';

export const supabase: SupabaseClient<Database> = createClient<Database>(
  effectiveUrl,
  effectiveAnonKey,
  {
    auth: {
      storage: expoSecureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

let appStateListenerRegistered = false;

export function registerSupabaseAutoRefresh(): void {
  if (appStateListenerRegistered || !supabaseEnvStatus.isConfigured) {
    return;
  }
  appStateListenerRegistered = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
