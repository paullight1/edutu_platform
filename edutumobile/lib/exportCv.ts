import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { buildCVHtml, shareCV } from '@edutu/core/src/services/cv';
import type { UserCV } from '@edutu/core/src/types/cv';

function safeFileName(name?: string) {
  const base = (name || 'My CV').trim().replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'My-CV'}.pdf`;
}

/**
 * Export a CV as a real PDF and open the OS share sheet.
 * Falls back to the plain-text share if PDF generation isn't possible.
 * Returns which path ran, so callers can message the user accurately.
 */
export async function exportCVAsPdf(cv: Partial<UserCV>): Promise<'pdf' | 'text'> {
  try {
    const { uri } = await Print.printToFileAsync({ html: buildCVHtml(cv) });

    // Rename the random print-XXXX.pdf so the shared file carries the CV name.
    let shareUri = uri;
    try {
      const target = new File(Paths.cache, safeFileName(cv.name));
      if (target.exists) target.delete();
      new File(uri).copy(target);
      shareUri = target.uri;
    } catch {
      // sharing the original temp file is fine
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: cv.name || 'My CV',
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
