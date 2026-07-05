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

// Writes the roadmap's .ics to the cache and opens the native share sheet so the
// user can add it to Apple/Google/Outlook calendars. The ICS itself carries the
// per-event reminders, so this one action delivers "put it on my calendar".
export async function exportRoadmapToCalendar(
  roadmap: AIGeneratedRoadmap,
  opportunityTitle: string,
): Promise<RoadmapExportResult> {
  try {
    if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };

    const { ics, filename } = buildRoadmapIcs(roadmap, opportunityTitle);
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
