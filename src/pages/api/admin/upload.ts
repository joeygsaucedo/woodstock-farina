import type { APIRoute } from 'astro';
import { isAuthenticated, unauthorized } from '../../../lib/adminAuth';
import { uploadImage, hasBlobStorage, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../../lib/blob';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) return unauthorized();
  if (!hasBlobStorage()) {
    return json({ success: false, message: 'Image storage is not configured.' }, 503);
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get('image');
    file = candidate instanceof File ? candidate : null;
  } catch {
    return json({ success: false, message: 'Invalid upload.' }, 400);
  }

  if (!file) {
    return json({ success: false, message: 'No image was provided.' }, 400);
  }

  // This is the one endpoint accepting arbitrary bytes, so check type and size
  // before anything touches storage.
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return json(
      { success: false, message: `Unsupported file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}` },
      415,
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return json(
      { success: false, message: `Image is too large. Maximum ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.` },
      413,
    );
  }

  try {
    const stored = await uploadImage(file);
    return json({ success: true, ...stored });
  } catch (error) {
    console.error('Image upload failed:', error);
    return json({ success: false, message: 'Could not upload the image.' }, 502);
  }
};
