import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { buildCVHtml, shareCV } from '@edutu/core/src/services/cv';
import type { UserCV } from '@edutu/core/src/types/cv';

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

/**
 * Export a CV as a real PDF and open the OS share sheet.
 * Falls back to the plain-text share if PDF generation isn't possible.
 * Returns which path ran, so callers can message the user accurately.
 */
export async function exportCVAsPdf(
  cv: Partial<UserCV>,
  options?: { tailoredTo?: string | null },
): Promise<'pdf' | 'text'> {
  const exportName = buildExportName({
    fullName: cv.data_json?.header?.full_name,
    kind: 'CV',
    context: options?.tailoredTo,
  });

  try {
    const { uri } = await Print.printToFileAsync({ html: buildCVHtml(cv) });

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

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: exportName,
        UTI: 'com.adobe.pdf',
      });
      return 'pdf';
    }
    throw new Error('sharing-unavailable');
  } catch {
    await shareCV(cv);
    return 'text';
  }
}
