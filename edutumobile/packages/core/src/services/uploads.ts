import { requestProductApi, type GetAuthToken } from './productApi';

// Lazy-required inside uploadDocument (not a top-level import): the legacy
// entry touches native EventEmitter at load, which breaks importing this module
// in screen tests. Deferring keeps the module import side-effect-free.
type LegacyFileSystem = {
  uploadAsync: (
    url: string,
    fileUri: string,
    options: Record<string, unknown>,
  ) => Promise<{ status: number }>;
  FileSystemUploadType: { BINARY_CONTENT: number };
};

export type UploadKind = 'cv' | 'transcript' | 'essay' | 'other';

export interface UploadRecord {
  id: string;
  kind: string;
  fileName: string;
  parseStatus: string;
  createdAt: string;
}

type SignedUpload = {
  uploadId: string;
  uploadUrl: string;
  storagePath: string;
};

type IngestResult = {
  uploadId: string;
  parseStatus: string;
  chars: number;
};

export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Full upload flow: reserve a slot (+ signed URL), PUT the file straight to
 * storage, then ask the backend to parse it. Returns the upload id and parse
 * status so the caller can attach it to a fit-check / review.
 */
export async function uploadDocument(
  file: PickedDocument,
  options: { kind?: UploadKind; opportunityId?: string },
  getAuthToken: GetAuthToken,
): Promise<{ uploadId: string; parseStatus: string }> {
  const signed = await requestProductApi<SignedUpload>(
    '/uploads',
    {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.mimeType,
        kind: options.kind ?? 'other',
        opportunityId: options.opportunityId,
      }),
    },
    getAuthToken,
  );
  if (!signed?.uploadId) {
    throw new Error('Could not start the upload. Please try again.');
  }

  const { uploadAsync, FileSystemUploadType } = require('expo-file-system/legacy') as LegacyFileSystem;
  const put = await uploadAsync(signed.uploadUrl, file.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': file.mimeType, 'x-upsert': 'true' },
  });
  if (put.status < 200 || put.status >= 300) {
    throw new Error('Uploading the file failed. Please try again.');
  }

  const ingested = await requestProductApi<IngestResult>(
    `/uploads/${signed.uploadId}/ingest`,
    { method: 'POST' },
    getAuthToken,
  );
  return {
    uploadId: signed.uploadId,
    parseStatus: ingested?.parseStatus ?? 'pending',
  };
}

export async function listUploads(
  getAuthToken: GetAuthToken,
): Promise<UploadRecord[]> {
  const rows = await requestProductApi<UploadRecord[]>(
    '/uploads',
    { method: 'GET' },
    getAuthToken,
  );
  return rows ?? [];
}
