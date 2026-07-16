import { backendFetchJson } from './backend';

export interface UploadedImage {
  url: string;
  path: string;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Upload an image through the backend's admin image endpoint (service-role
 * Supabase storage, public bucket) and get back a hosted public URL.
 * Reuses POST /blog/upload-image — a generic AdminGuard image uploader.
 */
export async function uploadAdminImage(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be uploaded.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image is larger than 5 MB — please compress it first.');
  }

  const form = new FormData();
  form.append('file', file);

  // backendFetchJson merges admin auth headers and leaves Content-Type unset
  // for FormData bodies, letting the browser add the multipart boundary.
  return backendFetchJson<UploadedImage>('/blog/upload-image', {
    method: 'POST',
    body: form,
  });
}

/**
 * Read an image file's intrinsic dimensions so editors can warn when an
 * upload doesn't match the recommended pixel size.
 */
export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image file.'));
    };
    image.src = url;
  });
}
