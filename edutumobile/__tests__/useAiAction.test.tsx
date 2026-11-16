import { renderHook, act } from '@testing-library/react-native';
import type { AiAction } from '../components/ai/AiActionBar';

const mockSendChatMessage = jest.fn();
let mockIsBilling = false;

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: { id: 'user-1' } }),
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('token') }),
}));

jest.mock('@edutu/core/src/services/chat', () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/services/productApi', () => ({
  isAiBillingError: () => mockIsBilling,
}), { virtual: true });

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const { useAiAction } = require('../hooks/useAiAction');
const { AiActionError } = require('../components/ai/AiActionBar');

const fitCheck: AiAction = {
  label: 'Am I a fit?',
  intent: 'fit_check',
  message: 'Am I a fit?',
};
const nextMove: AiAction = {
  label: 'Next move',
  intent: 'next_move',
  message: "What's my next move?",
};

describe('useAiAction', () => {
  beforeEach(() => {
    mockSendChatMessage.mockReset();
    mockIsBilling = false;
  });

  it('keeps every action of a session in one thread instead of orphaning them', async () => {
    mockSendChatMessage
      .mockResolvedValueOnce({
        threadId: 'thread-1',
        assistantMessage: { content: 'You are a strong fit.' },
      })
      .mockResolvedValueOnce({
        threadId: 'thread-1',
        assistantMessage: { content: 'Draft your essay.' },
      });

    const { result } = renderHook(() =>
      useAiAction({ surface: 'opportunity_detail', opportunityId: 'opp-1' }),
    );

    let first: { text: string; threadId: string | null } | undefined;
    await act(async () => {
      first = await result.current(fitCheck);
    });
    expect(first).toEqual({
      text: 'You are a strong fit.',
      threadId: 'thread-1',
    });
    // First call has no thread yet — the backend mints one.
    expect(mockSendChatMessage.mock.calls[0][1]).toMatchObject({
      threadId: null,
    });

    let second: { text: string; threadId: string | null } | undefined;
    await act(async () => {
      second = await result.current(nextMove);
    });
    // The second action continues the same conversation.
    expect(mockSendChatMessage.mock.calls[1][1]).toMatchObject({
      threadId: 'thread-1',
    });
    expect(second?.threadId).toBe('thread-1');
  });

  it('marks a billing failure structurally so the UI can offer Upgrade', async () => {
    mockIsBilling = true;
    mockSendChatMessage.mockRejectedValue(new Error('402'));

    const { result } = renderHook(() =>
      useAiAction({ surface: 'application_tracker' }),
    );

    await act(async () => {
      await expect(result.current(fitCheck)).rejects.toMatchObject({
        kind: 'billing',
      });
    });
  });

  it('leaves other failures generic', async () => {
    mockSendChatMessage.mockRejectedValue(new AiActionError('boom'));

    const { result } = renderHook(() =>
      useAiAction({ surface: 'application_tracker' }),
    );

    await act(async () => {
      await expect(result.current(fitCheck)).rejects.toMatchObject({
        kind: 'generic',
      });
    });
  });
});
