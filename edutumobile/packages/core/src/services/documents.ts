/**
 * "My Documents" helpers — fetching signed download URLs for the user's
 * win-coach uploads and building clean, professional file/display names.
 * (Lives beside uploads.ts rather than inside it so the upload flow module
 * stays untouched by document-listing concerns.)
 */
import { requestProductApi, type GetAuthToken } from './productApi';

export type UploadDownloadUrl = {
  url: string;
  fileName: string;
  mimeType: string;
  expiresIn: number;
};

/** Signed, short-lived (~5 min) URL to download one of the user's uploads. */
export async function getUploadDownloadUrl(
  uploadId: string,
  getAuthToken: GetAuthToken,
): Promise<UploadDownloadUrl | null> {
  return requestProductApi<UploadDownloadUrl>(
    `/uploads/${encodeURIComponent(uploadId)}/download-url`,
    { method: 'GET' },
    getAuthToken,
  );
}

const MAX_FILE_NAME_CHARS = 80;

/**
 * Sanitize a file name for the local filesystem and share sheets: strips
 * filesystem-hostile characters, collapses whitespace, and caps the total
 * length at 80 chars while preserving the extension.
 */
export function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf('.');
  const hasExt = dot > 0 && dot < trimmed.length - 1 && trimmed.length - dot <= 8;
  const ext = hasExt ? trimmed.slice(dot) : '';
  const base = (hasExt ? trimmed.slice(0, dot) : trimmed)
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safeBase = base || 'Document';
  const budget = Math.max(1, MAX_FILE_NAME_CHARS - ext.length);
  return `${safeBase.slice(0, budget).trim()}${ext}`;
}

/**
 * Human display name for an uploaded file: drop the extension and turn
 * underscore/dash word-mush into spaced words ("john_doe-transcript_2024"
 * → "john doe transcript 2024").
 */
export function displayNameForUpload(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || fileName;
}

/** "{Full Name} - CV.pdf" style professional export name. */
export function professionalFileName(
  fullName: string | null | undefined,
  label: string,
  extension: string,
): string {
  const owner = (fullName || '').trim();
  const base = owner ? `${owner} - ${label}` : label;
  return sanitizeFileName(`${base}.${extension.replace(/^\./, '')}`);
}
