import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildRoadmapIcs } from '../packages/core/src/services/roadmapCalendar';
import type { AIGeneratedRoadmap } from '../packages/core/src/services/aiRoadmapGenerator';

export interface RoadmapExportResult {
  ok: boolean;
  reason?: 'unsupported' | 'no-sharing' | 'error';
  uri?: string;
}

/**
 * Writes an ICS string to the cache and opens the native share sheet so the user
 * can add it to Apple/Google/Outlook. Works for both client-built plans and an
 * ICS fetched from the backend enrollment calendar endpoint.
 */
export async function shareIcsString(
  ics: string,
  filename: string,
): Promise<RoadmapExportResult> {
  try {
    if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };
    if (!ics) return { ok: false, reason: 'error' };

    const file = new File(Paths.cache, filename);
    file.write(ics);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/calendar',
        dialogTitle: 'Add roadmap to calendar',
      });
      return { ok: true, uri: file.uri };
    }

    return { ok: false, reason: 'no-sharing', uri: file.uri };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

// Builds the roadmap's .ics from an AI-generated plan, then shares it. The ICS
// carries per-event reminders, so this one action delivers "put it on my calendar".
export async function exportRoadmapToCalendar(
  roadmap: AIGeneratedRoadmap,
  opportunityTitle: string,
): Promise<RoadmapExportResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };
  const { ics, filename } = buildRoadmapIcs(roadmap, opportunityTitle);
  return shareIcsString(ics, filename);
}
