import { getApiBaseUrl } from '../lib/apiBaseUrl';

export interface MentorProofUploadResult {
  path: string;
  fileName: string;
  contentType: string;
  size: number;
}

export async function uploadMentorProof(
  token: string,
  file: File,
  signal?: AbortSignal,
): Promise<MentorProofUploadResult> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${getApiBaseUrl()}/creator/proof-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body?.message.join(', ') : body?.message;
    throw new Error(message || `Proof upload failed (${response.status})`);
  }

  return response.json() as Promise<MentorProofUploadResult>;
}
