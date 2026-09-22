import { put, del } from '@vercel/blob';
import { readEnv } from './env';

const TOKEN = readEnv(import.meta.env.BLOB_READ_WRITE_TOKEN, 'BLOB_READ_WRITE_TOKEN');

export const hasBlobStorage = (): boolean => Boolean(TOKEN);

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface StoredImage {
  url: string;
  path: string;
}

/**
 * Stores an event image. `addRandomSuffix` keeps uploads from colliding or
 * being guessable, and the returned path is what lets us delete it later.
 */
export const uploadImage = async (file: File): Promise<StoredImage> => {
  if (!TOKEN) {
    throw new Error('Image storage is not configured.');
  }

  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const blob = await put(`events/image.${extension}`, file, {
    access: 'public',
    token: TOKEN,
    addRandomSuffix: true,
    contentType: file.type,
  });

  return { url: blob.url, path: blob.pathname };
};

/** Best effort: a missing blob should never block deleting its event. */
export const deleteImage = async (path: string): Promise<void> => {
  if (!TOKEN || !path) return;
  try {
    await del(path, { token: TOKEN });
  } catch (error) {
    console.error('Could not delete blob', path, error);
  }
};
