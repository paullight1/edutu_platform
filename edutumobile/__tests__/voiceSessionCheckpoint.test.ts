import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearVoiceSessionCheckpoint,
  loadVoiceSessionCheckpoint,
  saveVoiceSessionCheckpoint,
} from '../lib/voiceSessionCheckpoint';

describe('voice session background checkpoint', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('persists the thread and visible transcript for the signed-in account', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await saveVoiceSessionCheckpoint('user_1', {
      threadId: 'thread-1',
      userTranscript: 'I need a scholarship',
      assistantReply: 'Let me find the best matches.',
      pendingUserTranscript: true,
    });

    await expect(loadVoiceSessionCheckpoint('user_1')).resolves.toEqual({
      threadId: 'thread-1',
      userTranscript: 'I need a scholarship',
      assistantReply: 'Let me find the best matches.',
      pendingUserTranscript: true,
      updatedAt: 1_000_000,
    });
    await expect(loadVoiceSessionCheckpoint('user_2')).resolves.toBeNull();
  });

  it('drops stale checkpoints instead of restoring an old conversation as live', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await saveVoiceSessionCheckpoint('user_1', {
      threadId: 'thread-old',
      userTranscript: 'Old words',
      assistantReply: null,
      pendingUserTranscript: true,
    });

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + 25 * 60 * 60 * 1000);

    await expect(loadVoiceSessionCheckpoint('user_1')).resolves.toBeNull();
  });

  it('clears the checkpoint when the conversation is explicitly ended', async () => {
    await saveVoiceSessionCheckpoint('user_1', {
      threadId: 'thread-1',
      userTranscript: 'Words',
      assistantReply: null,
      pendingUserTranscript: false,
    });

    await clearVoiceSessionCheckpoint('user_1');

    await expect(loadVoiceSessionCheckpoint('user_1')).resolves.toBeNull();
  });
});
