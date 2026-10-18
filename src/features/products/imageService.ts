import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  base64ToUint8Array,
  buildProductImageStoragePath,
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGES_BUCKET,
  validateProductImageCandidate,
  type AllowedImageMimeType,
} from '@/features/products/schemas';
import { supabase, supabaseEnvStatus } from '@/lib/supabase';

export interface PreparedProductImage {
  localUri: string;
  arrayBuffer: ArrayBuffer;
  mimeType: AllowedImageMimeType;
  extension: 'jpg' | 'webp';
  fileSizeBytes: number;
}

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hora
const CACHE_EXPIRY_MS = 45 * 60 * 1000; // 45 minutos

interface SignedUrlCacheEntry {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

/**
 * Abre a câmera ou galeria do aparelho, redimensiona para no máximo 1080px,
 * comprime em JPEG otimizado com `base64: true` e converte diretamente
 * para ArrayBuffer binário (evitando corrupção do fetch(file://) no Android).
 */
export async function pickAndOptimizeProductImage(
  source: 'camera' | 'library',
): Promise<PreparedProductImage | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Permissão de uso da câmera negada. Habilite a câmera nas configurações do aparelho.',
      );
    }
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Permissão de acesso à galeria negada. Habilite o acesso às fotos nas configurações do aparelho.',
      );
    }
  }

  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const selectedAsset = result.assets[0];

  const manipulated = await ImageManipulator.manipulateAsync(
    selectedAsset.uri,
    [{ resize: { width: 1080 } }],
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  if (!manipulated.base64) {
    throw new Error(
      'Não foi possível processar os bytes da imagem selecionada. Tente outra foto.',
    );
  }

  const bytes = base64ToUint8Array(manipulated.base64);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const fileSizeBytes = arrayBuffer.byteLength;

  if (fileSizeBytes <= 0 || fileSizeBytes > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error(
      'A imagem processada excede o limite de 5 MB. Escolha outra foto.',
    );
  }

  const validation = validateProductImageCandidate('image/jpeg', fileSizeBytes);
  if (!validation.valid || !validation.normalizedMimeType) {
    throw new Error(
      validation.errorMessage ?? 'Formato de imagem inválido para upload.',
    );
  }

  return {
    localUri: manipulated.uri,
    arrayBuffer,
    mimeType: validation.normalizedMimeType,
    extension: 'jpg',
    fileSizeBytes,
  };
}

/**
 * Faz o upload da imagem otimizada para o bucket privado `product-images`
 * no caminho `<workspace_uuid>/<product_uuid>/<arquivo>.jpg` e grava o
 * `storage_path` no banco de dados (RF-022, RF-023, RF-024).
 */
export async function uploadProductImageToPrivateBucket(
  workspaceId: string,
  productId: string,
  prepared: PreparedProductImage,
  previousStoragePath?: string | null,
): Promise<string> {
  if (!supabaseEnvStatus.isConfigured) {
    throw new Error('O Supabase não está configurado.');
  }

  const validation = validateProductImageCandidate(
    prepared.mimeType,
    prepared.fileSizeBytes,
  );
  if (!validation.valid || !validation.normalizedMimeType) {
    throw new Error(
      validation.errorMessage ?? 'Imagem inválida para envio ao Storage.',
    );
  }

  const storagePath = buildProductImageStoragePath(
    workspaceId,
    productId,
    prepared.extension,
  );

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, prepared.arrayBuffer, {
      contentType: validation.normalizedMimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      'Não foi possível enviar a foto para o Storage privado. Verifique se a migração da Fase 3 foi executada.',
      { cause: uploadError },
    );
  }

  const { error: imageRowError } = await supabase
    .from('product_images')
    .insert({
      workspace_id: workspaceId,
      product_id: productId,
      storage_path: storagePath,
      mime_type: validation.normalizedMimeType,
      file_size_bytes: prepared.fileSizeBytes,
    });

  if (imageRowError) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
    throw new Error(
      'Não foi possível registrar os metadados da imagem do produto.',
      { cause: imageRowError },
    );
  }

  const { error: updateProductError } = await supabase
    .from('products')
    .update({ primary_image_path: storagePath })
    .eq('workspace_id', workspaceId)
    .eq('id', productId);

  if (updateProductError) {
    throw new Error(
      'Não foi possível vincular a imagem principal ao produto.',
      { cause: updateProductError },
    );
  }

  if (previousStoragePath && previousStoragePath !== storagePath) {
    signedUrlCache.delete(previousStoragePath);
    await supabase
      .from('product_images')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('product_id', productId)
      .eq('storage_path', previousStoragePath);
    await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove([previousStoragePath]);
  }

  return storagePath;
}

/**
 * Remove a foto principal do produto tanto do banco quanto do bucket privado.
 */
export async function removeProductPrimaryImage(
  workspaceId: string,
  productId: string,
  storagePath: string,
): Promise<void> {
  const { error: updateError } = await supabase
    .from('products')
    .update({ primary_image_path: null })
    .eq('workspace_id', workspaceId)
    .eq('id', productId);

  if (updateError) {
    throw new Error('Não foi possível desvincular a foto do produto.', {
      cause: updateError,
    });
  }

  signedUrlCache.delete(storagePath);

  await supabase
    .from('product_images')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('product_id', productId)
    .eq('storage_path', storagePath);

  await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
}

/**
 * Gera uma URL assinada temporária para exibir uma foto privada do bucket
 * `product-images`, utilizando cache em memória até perto da expiração.
 */
export async function getSignedProductImageUrl(
  storagePath: string | null | undefined,
): Promise<string | null> {
  if (!storagePath || !supabaseEnvStatus.isConfigured) {
    return null;
  }

  const cached = signedUrlCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expiresAt: now + CACHE_EXPIRY_MS,
  });

  return data.signedUrl;
}
