/* Pictures (profile photo, receipts) in the private Supabase Storage bucket
 * `media`. Every object lives under `<user id>/…` — the bucket's policies only
 * let a user touch their own folder (see migration 20260924150000_media.sql).
 * Images are shrunk in the browser before upload, and shown via short-lived
 * signed URLs (the bucket is not public). */
import { supabase } from './supabase';

const BUCKET = 'media';

/** Resize to fit `maxSide` and re-encode as JPEG. Falls back to the original
 *  file if the browser can't decode it (e.g. HEIC on desktop Chrome). */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export async function uploadImage(path: string, blob: Blob): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'image/jpeg',
    cacheControl: '3600',
  });
  if (!error) urlCache.delete(path);
  return {
    error: error
      ? /bucket not found/i.test(error.message)
        ? 'Picture storage isn’t set up yet — run the media SQL in Supabase first.'
        : error.message
      : null,
  };
}

export async function removeImages(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  list.forEach((p) => urlCache.delete(p));
  await supabase.storage.from(BUCKET).remove(list);
}

/* Signed URLs are valid for an hour; reuse them for 50 minutes. */
const urlCache = new Map<string, { url: string; exp: number }>();

export async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

/** Unique object path with a cache-busting suffix (avatars are replaced in place otherwise). */
export const mediaPath = (userId: string, kind: 'avatar' | 'receipts', name: string) =>
  `${userId}/${kind}/${name}-${Date.now().toString(36)}.jpg`;
