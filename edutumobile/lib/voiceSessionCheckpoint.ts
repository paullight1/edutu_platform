import AsyncStorage from '@react-native-async-storage/async-storage';

export interface VoiceSessionCheckpoint {
  threadId: string | null;
  userTranscript: string | null;
  assistantReply: string | null;
  pendingUserTranscript: boolean;
  updatedAt: number;
}

type SaveVoiceSessionCheckpoint = Omit<VoiceSessionCheckpoint, 'updatedAt'>;

const PREFIX = '@edutu/voice-session/v1/';
const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_THREAD_ID_LENGTH = 256;
const MAX_USER_TRANSCRIPT_LENGTH = 4_000;
const MAX_ASSISTANT_REPLY_LENGTH = 12_000;

function keyFor(userId: string): string {
  return `${PREFIX}${encodeURIComponent(userId)}`;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function saveVoiceSessionCheckpoint(
  userId: string,
  checkpoint: SaveVoiceSessionCheckpoint,
): Promise<void> {
  if (!userId) return;
  const value: VoiceSessionCheckpoint = {
    threadId: boundedString(checkpoint.threadId, MAX_THREAD_ID_LENGTH),
    userTranscript: boundedString(checkpoint.userTranscript, MAX_USER_TRANSCRIPT_LENGTH),
    assistantReply: boundedString(checkpoint.assistantReply, MAX_ASSISTANT_REPLY_LENGTH),
    pendingUserTranscript: checkpoint.pendingUserTranscript === true,
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(value));
}

export async function loadVoiceSessionCheckpoint(
  userId: string,
): Promise<VoiceSessionCheckpoint | null> {
  if (!userId) return null;
  const key = keyFor(userId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VoiceSessionCheckpoint>;
    const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
    if (
      !Number.isFinite(updatedAt) ||
      updatedAt <= 0 ||
      Date.now() - updatedAt > CHECKPOINT_TTL_MS ||
      updatedAt - Date.now() > 60_000
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return {
      threadId: boundedString(parsed.threadId, MAX_THREAD_ID_LENGTH),
      userTranscript: boundedString(parsed.userTranscript, MAX_USER_TRANSCRIPT_LENGTH),
      assistantReply: boundedString(parsed.assistantReply, MAX_ASSISTANT_REPLY_LENGTH),
      pendingUserTranscript: parsed.pendingUserTranscript === true,
      updatedAt,
    };
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function clearVoiceSessionCheckpoint(userId: string): Promise<void> {
  if (!userId) return;
  await AsyncStorage.removeItem(keyFor(userId));
}
