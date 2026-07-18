import { sendChatMessage } from '../packages/core/src/services/chat';

// A Supabase stub whose chat-proxy path would throw — proves the backend path
// (with our context/intent) is the one exercised when fetch succeeds.
const supabaseStub = {
  functions: {
    invoke: async () => {
      throw new Error('chat-proxy should not be called when backend succeeds');
    },
  },
} as never;

describe('sendChatMessage — win-coach context/intent', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('sends context and intent in the backend request body', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ threadId: 't1' }),
    }));
    // @ts-expect-error partial fetch mock is fine for this test
    global.fetch = fetchMock;

    await sendChatMessage(supabaseStub, {
      message: 'Am I a fit?',
      userId: 'user_1',
      authToken: 'token_abc',
      context: { surface: 'opportunity_detail', opportunityId: 'opp_1' },
      intent: 'fit_check',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.context).toEqual({
      surface: 'opportunity_detail',
      opportunityId: 'opp_1',
    });
    expect(body.intent).toBe('fit_check');
  });

  it('omits context/intent when not provided', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ threadId: 't1' }),
    }));
    // @ts-expect-error partial fetch mock is fine for this test
    global.fetch = fetchMock;

    await sendChatMessage(supabaseStub, {
      message: 'hello',
      userId: 'user_1',
      authToken: 'token_abc',
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('context');
    expect(body).not.toHaveProperty('intent');
  });
});
