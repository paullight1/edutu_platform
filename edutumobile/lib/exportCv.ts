import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { buildCVHtml, shareCV } from '@edutu/core/src/services/cv';
import { resolveTemplateDesignById } from '@edutu/core/src/services/templateDesigns';
import type { CVTemplateDesign, UserCV } from '@edutu/core/src/types/cv';

/** Strip filesystem-hostile characters and collapse whitespace. */
function sanitizeForFileName(value?: string | null): string {
  return String(value || '')
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Professional export naming:
 * - "{Full Name} - CV" for plain exports
 * - "{Full Name} - CV - {Opportunity}" when tailored to an opportunity
 * - "{Full Name} - Cover Letter - {Org}" for cover letters
 * Falls back to "Edutu CV" when the CV has no full name. ≤ 80 chars.
 */
export function buildExportName(options: {
  fullName?: string | null;
  kind?: 'CV' | 'Cover Letter';
  context?: string | null;
}): string {
  const fullName = sanitizeForFileName(options.fullName);
  const context = sanitizeForFileName(options.context);
  const parts = fullName
    ? [fullName, options.kind || 'CV']
    : ['Edutu CV'];
  if (context) parts.push(context);
  return parts.join(' - ').slice(0, 80).trim();
}

/** Why a PDF export could not complete — drives what the user is told. */
export type CvExportFailure = 'render-failed' | 'sharing-unavailable' | 'share-failed';

export type CvExportResult =
  | { ok: true; mode: 'pdf' | 'text' }
  | { ok: false; reason: CvExportFailure; error?: unknown };

/**
 * Export a CV as a real PDF and open the OS share sheet.
 *
 * This used to catch every error and silently share plain text instead, so a
 * user who asked for a PDF got a text message with no explanation. Now each
 * failure mode is reported distinctly and the caller decides whether to offer
 * a retry or the text fallback — the fallback only runs when explicitly asked
 * for via `fallbackToText`.
 */
export async function exportCVAsPdf(
  cv: Partial<UserCV>,
  options?: { tailoredTo?: string | null; design?: CVTemplateDesign | null; fallbackToText?: boolean },
): Promise<CvExportResult> {
  const exportName = buildExportName({
    fullName: cv.data_json?.header?.full_name,
    kind: 'CV',
    context: options?.tailoredTo,
  });

  const design = options?.design || resolveTemplateDesignById(cv.template_id);

  let uri: string;
  try {
    ({ uri } = await Print.printToFileAsync({ html: buildCVHtml(cv, design) }));
  } catch (error) {
    if (options?.fallbackToText) {
      await shareCV(cv);
      return { ok: true, mode: 'text' };
    }
    return { ok: false, reason: 'render-failed', error };
  }

  // Rename the random print-XXXX.pdf so the shared file carries a
  // professional "{Full Name} - CV[ - Opportunity]" name.
  let shareUri = uri;
  try {
    const target = new File(Paths.cache, `${exportName}.pdf`);
    if (target.exists) target.delete();
    new File(uri).copy(target);
    shareUri = target.uri;
  } catch {
    // sharing the original temp file is fine
  }

  if (!(await Sharing.isAvailableAsync())) {
    if (options?.fallbackToText) {
      await shareCV(cv);
      return { ok: true, mode: 'text' };
    }
    return { ok: false, reason: 'sharing-unavailable' };
  }

  try {
    await Sharing.shareAsync(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: exportName,
      UTI: 'com.adobe.pdf',
    });
    return { ok: true, mode: 'pdf' };
  } catch (error) {
    return { ok: false, reason: 'share-failed', error };
  }
}

/** Explicit plain-text share, offered as the recovery action on failure. */
export async function exportCVAsText(cv: Partial<UserCV>): Promise<CvExportResult> {
  await shareCV(cv);
  return { ok: true, mode: 'text' };
}
