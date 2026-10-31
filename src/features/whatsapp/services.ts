import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Share } from 'react-native';

import {
  DEFAULT_WORKSPACE_PIX_SETTINGS,
  getWorkspacePixSettings,
  normalizeWhatsAppPhoneBR,
  type WorkspacePixSettings,
} from '@/features/whatsapp/schemas';
import { supabase, supabaseEnvStatus } from '@/lib/supabase';
import type { WorkspaceRow } from '@/types/database';

const memoryPixCache = new Map<string, WorkspacePixSettings>();

function getStorageKey(workspaceId: string): string {
  return `vendefacil_pix_${workspaceId}`;
}

async function readLocalPixCache(
  workspaceId: string,
): Promise<WorkspacePixSettings | null> {
  const cached = memoryPixCache.get(workspaceId);
  if (cached) {
    return cached;
  }

  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(getStorageKey(workspaceId));
      }
    } else {
      raw = await SecureStore.getItemAsync(getStorageKey(workspaceId));
    }

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<WorkspacePixSettings>;
    const normalized: WorkspacePixSettings = {
      pixKeyType: parsed.pixKeyType ?? 'cpf_cnpj',
      pixKey: typeof parsed.pixKey === 'string' ? parsed.pixKey : '',
      pixBankName:
        typeof parsed.pixBankName === 'string' ? parsed.pixBankName : '',
      pixHolderName:
        typeof parsed.pixHolderName === 'string' ? parsed.pixHolderName : '',
    };
    memoryPixCache.set(workspaceId, normalized);
    return normalized;
  } catch {
    return null;
  }
}

async function writeLocalPixCache(
  workspaceId: string,
  settings: WorkspacePixSettings,
): Promise<void> {
  memoryPixCache.set(workspaceId, settings);
  try {
    const raw = JSON.stringify(settings);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(getStorageKey(workspaceId), raw);
      }
    } else {
      await SecureStore.setItemAsync(getStorageKey(workspaceId), raw);
    }
  } catch {
    // Ignora falha de cache local
  }
}

export function getEffectiveWorkspacePixSettings(
  workspace: WorkspaceRow | null | undefined,
): WorkspacePixSettings {
  if (!workspace) {
    return DEFAULT_WORKSPACE_PIX_SETTINGS;
  }
  const cached = memoryPixCache.get(workspace.id) ?? null;
  return getWorkspacePixSettings(workspace, cached);
}

export function useWorkspacePixSettings(
  workspace: WorkspaceRow | null | undefined,
): {
  pixSettings: WorkspacePixSettings;
  refreshPixSettings: () => Promise<void>;
} {
  const [localFallback, setLocalFallback] =
    useState<WorkspacePixSettings | null>(
      workspace ? (memoryPixCache.get(workspace.id) ?? null) : null,
    );

  const refreshPixSettings = useCallback(async () => {
    if (!workspace?.id) {
      setLocalFallback(null);
      return;
    }
    const local = await readLocalPixCache(workspace.id);
    setLocalFallback(local);
  }, [workspace?.id]);

  useEffect(() => {
    void refreshPixSettings();
  }, [refreshPixSettings]);

  const pixSettings = getWorkspacePixSettings(workspace, localFallback);

  return {
    pixSettings,
    refreshPixSettings,
  };
}

export async function saveWorkspacePixSettings(params: {
  workspaceId: string;
  settings: WorkspacePixSettings;
}): Promise<WorkspacePixSettings> {
  const { workspaceId, settings } = params;

  // Salva imediatamente no cache seguro local para disponibilidade instantânea
  await writeLocalPixCache(workspaceId, settings);

  if (supabaseEnvStatus.isConfigured) {
    const { error } = await supabase.rpc('update_workspace_pix_settings', {
      p_workspace_id: workspaceId,
      p_pix_key_type: settings.pixKey ? settings.pixKeyType : null,
      p_pix_key: settings.pixKey || null,
      p_pix_bank_name: settings.pixBankName || null,
      p_pix_holder_name: settings.pixHolderName || null,
    });

    if (error) {
      const msg = error.message ?? '';
      // Se a migration 10 ainda não foi rodada no Supabase, tenta update direto ou mantém cache local sem travar o lojista
      const isMissingRpc =
        error.code === 'PGRST202' ||
        msg.includes('Could not find the function') ||
        msg.includes('pix_key');
      if (!isMissingRpc) {
        throw new Error(error.message);
      }
    }
  }

  return settings;
}

export async function openWhatsAppWithMessage(params: {
  phone?: string | null;
  message: string;
}): Promise<void> {
  const normalizedPhone = normalizeWhatsAppPhoneBR(params.phone);
  const encodedText = encodeURIComponent(params.message);

  try {
    if (normalizedPhone) {
      const appUrl = `whatsapp://send?phone=${normalizedPhone}&text=${encodedText}`;
      const webUrl = `https://wa.me/${normalizedPhone}?text=${encodedText}`;

      if (Platform.OS === 'web') {
        await Linking.openURL(webUrl);
        return;
      }

      const canOpenApp = await Linking.canOpenURL(appUrl).catch(() => false);
      if (canOpenApp) {
        await Linking.openURL(appUrl);
        return;
      }

      await Linking.openURL(webUrl);
      return;
    }

    // Sem telefone cadastrado: abre o seletor de contatos do próprio WhatsApp com o texto preenchido
    const appPickerUrl = `whatsapp://send?text=${encodedText}`;
    const webPickerUrl = `https://api.whatsapp.com/send?text=${encodedText}`;

    if (Platform.OS === 'web') {
      await Linking.openURL(webPickerUrl);
      return;
    }

    const canOpenPicker = await Linking.canOpenURL(appPickerUrl).catch(
      () => false,
    );
    if (canOpenPicker) {
      await Linking.openURL(appPickerUrl);
      return;
    }

    // Fallback para o menu de compartilhamento nativo do sistema
    await Share.share({ message: params.message });
  } catch {
    Alert.alert(
      'WhatsApp indisponível',
      'Não foi possível abrir o WhatsApp neste dispositivo.',
    );
  }
}
