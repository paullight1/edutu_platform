/**
 * Contract tests for the Group Discussions mobile client.
 *
 * These assert the exact wire shape — path, method, body — because the backend
 * controller is written independently: a client that "works" against a mock of
 * itself proves nothing. Every assertion here is one the real Nest route would
 * reject if it drifted.
 */
const mockFetch = jest.fn();

const mockChannel = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn(() => mockChannel),
};

const mockSupabase = {
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn(async () => 'ok'),
};

jest.mock('../lib/supabase', () => ({
  __esModule: true,
  supabase: mockSupabase,
}));

const API_BASE = 'https://api.example.test';

function loadCommunities() {
  process.env.EXPO_PUBLIC_API_URL = API_BASE;
  return require('../packages/core/src/services/communities') as typeof import('../packages/core/src/services/communities');
}

function loadRealtime() {
  return require('../packages/core/src/services/communityRealtime') as typeof import('../packages/core/src/services/communityRealtime');
}

const getAuthToken = async () => 'test-token';

/** A successful JSON response, as `fetch` would hand it back. */
function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

/** A Nest exception response: `{ statusCode, message, error }`. */
function fail(status: number, message: unknown) {
  return {
    ok: false,
    status,
    json: async () => ({ statusCode: status, message, error: 'Bad Request' }),
  };
}

/** The single fetch call recorded by the mock, as [url, init]. */
function lastCall(): [string, RequestInit] {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return [call[0] as string, call[1] as RequestInit];
}

describe('communities service', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
    mockSupabase.channel.mockClear();
    mockSupabase.removeChannel.mockClear();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('sends the create-group body the backend DTO expects', async () => {
    mockFetch.mockResolvedValue(ok({ id: 'g1', name: 'Chevening 2026' }));
    const { createGroup } = loadCommunities();

    const group = await createGroup(
      {
        name: 'Chevening 2026',
        description: 'Applying together',
        opportunityId: '11111111-1111-4111-8111-111111111111',
        visibility: 'private',
        joinPolicy: 'request',
        coverEmoji: '🎓',
      },
      getAuthToken,
    );

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/groups`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Chevening 2026',
      description: 'Applying together',
      opportunityId: '11111111-1111-4111-8111-111111111111',
      visibility: 'private',
      joinPolicy: 'request',
      coverEmoji: '🎓',
    });
    expect(group).toEqual({ id: 'g1', name: 'Chevening 2026' });
  });

  it('omits absent create-group fields rather than sending explicit nulls', async () => {
    // CreateGroupSchema marks these `.optional()` with `.default()`s; a literal
    // `null` fails the zod parse and would 400 a perfectly valid group.
    mockFetch.mockResolvedValue(ok({ id: 'g2' }));
    const { createGroup } = loadCommunities();

    await createGroup({ name: 'Study group' }, getAuthToken);

    const [, init] = lastCall();
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Study group' });
  });

  it('posts a message to the group message route with the DTO body', async () => {
    mockFetch.mockResolvedValue(ok({ id: 'm1', body: 'hello' }));
    const { sendMessage } = loadCommunities();

    await sendMessage(
      'g1',
      { body: 'hello', opportunityId: '22222222-2222-4222-8222-222222222222' },
      getAuthToken,
    );

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/groups/g1/messages`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      body: 'hello',
      opportunityId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('forwards beforeId alongside before when paging messages', async () => {
    // THE keyset regression guard. `created_at` is `defaultNow()`, i.e.
    // transaction time, so two rows written in one transaction share an exact
    // instant. Paging on the timestamp alone silently drops every row on the
    // page boundary; `beforeId` is the tiebreak the backend needs.
    mockFetch.mockResolvedValue(ok([]));
    const { fetchMessages } = loadCommunities();

    await fetchMessages(
      'g1',
      { before: '2026-08-03T10:00:00.000Z', beforeId: 'm9', limit: 25 },
      getAuthToken,
    );

    const [url, init] = lastCall();
    expect(init.method).toBe('GET');
    expect(url).toBe(
      `${API_BASE}/communities/groups/g1/messages` +
        '?before=2026-08-03T10%3A00%3A00.000Z&beforeId=m9&limit=25',
    );
  });

  it('accepts a Date cursor and sends it as an ISO instant', async () => {
    mockFetch.mockResolvedValue(ok([]));
    const { fetchMessages } = loadCommunities();

    await fetchMessages(
      'g1',
      { before: new Date('2026-08-03T10:00:00.000Z'), beforeId: 'm9' },
      getAuthToken,
    );

    const [url] = lastCall();
    expect(url).toContain('before=2026-08-03T10%3A00%3A00.000Z');
    expect(url).toContain('beforeId=m9');
  });

  it('sends no query string at all for the first page', async () => {
    mockFetch.mockResolvedValue(ok([]));
    const { fetchMessages } = loadCommunities();

    await fetchMessages('g1', {}, getAuthToken);

    const [url] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/groups/g1/messages`);
  });

  it('surfaces the screener rejection as a human message, not a status code', async () => {
    const sentence =
      "That message can't be sent — it reads like it's asking for money, " +
      'secrets, or to move the conversation off Edutu, which we block to keep ' +
      'members safe from scams.';
    mockFetch.mockResolvedValue(fail(400, sentence));
    const { sendMessage } = loadCommunities();

    await expect(
      sendMessage('g1', { body: 'send me $50' }, getAuthToken),
    ).rejects.toThrow(sentence);

    // And nothing resembling a status code leaks into what the user reads.
    await expect(
      sendMessage('g1', { body: 'send me $50' }, getAuthToken),
    ).rejects.toMatchObject({ message: sentence, status: 400 });
  });

  it('unwraps an array-valued Nest validation message into one sentence', async () => {
    mockFetch.mockResolvedValue(fail(400, ['Group name is too short']));
    const { createGroup } = loadCommunities();

    await expect(createGroup({ name: 'x' }, getAuthToken)).rejects.toThrow(
      'Group name is too short',
    );
  });

  it('surfaces the private-group refusal from a read, not a silent null', async () => {
    mockFetch.mockResolvedValue(
      fail(403, 'This group is private. Ask an owner for an invite.'),
    );
    const { fetchGroup } = loadCommunities();

    await expect(fetchGroup('g1', getAuthToken)).rejects.toThrow(
      'This group is private. Ask an owner for an invite.',
    );
  });

  it('builds the browse query from mine / opportunityId / query', async () => {
    mockFetch.mockResolvedValue(ok([]));
    const { fetchGroups } = loadCommunities();

    await fetchGroups(
      {
        mine: true,
        opportunityId: '33333333-3333-4333-8333-333333333333',
        query: 'chevening 2026',
      },
      getAuthToken,
    );

    const [url] = lastCall();
    expect(url).toBe(
      `${API_BASE}/communities/groups` +
        '?mine=true&opportunityId=33333333-3333-4333-8333-333333333333' +
        '&query=chevening%202026',
    );
  });

  it('reads the browse list as { group, membership } pairs, invitations included', async () => {
    // The backend returns the SAME shape from list and get. The membership is
    // the point: a private group cannot be self-joined, so an `invited` row is
    // the only way in, and while the list carried bare groups the invitation
    // was unreachable from anywhere in the app.
    mockFetch.mockResolvedValue(
      ok([
        {
          group: { id: 'g1', name: 'Invite only', visibility: 'private' },
          membership: { id: 'm1', groupId: 'g1', status: 'invited', role: 'member' },
        },
        { group: { id: 'g2', name: 'Open door', visibility: 'public' }, membership: null },
      ]),
    );
    const { fetchGroups } = loadCommunities();

    const rows = await fetchGroups({ mine: true }, getAuthToken);

    expect(rows.map((row) => [row.group.name, row.membership?.status ?? null])).toEqual([
      ['Invite only', 'invited'],
      ['Open door', null],
    ]);
  });

  it('drops a bare group row rather than blanking the screen on a deploy skew', async () => {
    // An older backend serving `CommunityGroup[]` would otherwise reach the
    // renderer as rows whose `group` is undefined.
    mockFetch.mockResolvedValue(ok([{ id: 'g1', name: 'Legacy shape' }]));
    const { fetchGroups } = loadCommunities();

    expect(await fetchGroups({}, getAuthToken)).toEqual([]);
  });

  it('routes leaveGroup at the caller own membership row', async () => {
    mockFetch.mockResolvedValue(ok({ success: true }));
    const { leaveGroup } = loadCommunities();

    await leaveGroup('g1', 'user_2abc', getAuthToken);

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/groups/g1/members/user_2abc`);
    expect(init.method).toBe('DELETE');
  });

  it('deletes a message on the group-independent message route', async () => {
    mockFetch.mockResolvedValue(ok({ id: 'm1', deletedAt: '2026-08-03T10:00:00.000Z' }));
    const { deleteMessage } = loadCommunities();

    await deleteMessage('m1', getAuthToken);

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/messages/m1`);
    expect(init.method).toBe('DELETE');
  });

  it('sends the join answers array even when empty', async () => {
    mockFetch.mockResolvedValue(ok({ status: 'pending', groupId: 'g1' }));
    const { joinGroup } = loadCommunities();

    await joinGroup('g1', [], getAuthToken);

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/groups/g1/join`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ answers: [] });
  });

  it('wraps the question list in { questions } when saving a form', async () => {
    mockFetch.mockResolvedValue(ok({ questions: [] }));
    const { saveGroupForm } = loadCommunities();

    const questions = [
      { id: 'q1', type: 'single_select' as const, label: 'Stage?', required: true, options: ['A', 'B'] },
    ];
    await saveGroupForm('g1', questions, getAuthToken);

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/groups/g1/form`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ questions });
  });

  it('posts a join-request decision to the request route', async () => {
    mockFetch.mockResolvedValue(ok({ id: 'r1', status: 'approved' }));
    const { decideJoinRequest } = loadCommunities();

    await decideJoinRequest('g1', 'r1', 'approved', getAuthToken);

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/groups/g1/requests/r1`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ decision: 'approved' });
  });

  it('reports a target with the ReportSchema body', async () => {
    mockFetch.mockResolvedValue(ok({ id: 'rep1' }));
    const { reportTarget } = loadCommunities();

    await reportTarget(
      { targetType: 'message', targetId: '44444444-4444-4444-8444-444444444444', reason: 'spam link' },
      getAuthToken,
    );

    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE}/communities/reports`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      targetType: 'message',
      targetId: '44444444-4444-4444-8444-444444444444',
      reason: 'spam link',
    });
  });

  it('refuses to call the API without a token instead of firing an anonymous request', async () => {
    const { fetchGroups } = loadCommunities();

    await expect(fetchGroups({}, async () => null)).rejects.toThrow(/sign(ed)? in/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('subscribeToGroupMessages', () => {
  beforeEach(() => {
    jest.resetModules();
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
    mockSupabase.channel.mockClear();
    mockSupabase.removeChannel.mockClear();
  });

  it('opens exactly one channel and removes it on unsubscribe', () => {
    const { subscribeToGroupMessages } = loadRealtime();

    const unsubscribe = subscribeToGroupMessages('g1', jest.fn());

    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    expect(mockSupabase.removeChannel).not.toHaveBeenCalled();

    unsubscribe();
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('is idempotent — a double unsubscribe still removes the channel once', () => {
    const { subscribeToGroupMessages } = loadRealtime();

    const unsubscribe = subscribeToGroupMessages('g1', jest.fn());
    unsubscribe();
    unsubscribe();

    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('filters postgres_changes to this group on both INSERT and UPDATE', () => {
    const { subscribeToGroupMessages } = loadRealtime();

    subscribeToGroupMessages('g1', jest.fn());

    const events = mockChannel.on.mock.calls.map((call) => (call[1] as { event: string }).event);
    expect(events).toEqual(['INSERT', 'UPDATE']);
    for (const call of mockChannel.on.mock.calls) {
      expect(call[0]).toBe('postgres_changes');
      expect(call[1]).toMatchObject({
        schema: 'public',
        table: 'community_group_messages',
        filter: 'group_id=eq.g1',
      });
    }
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
  });

  it('maps the raw snake_case row Realtime delivers into a CommunityMessage', () => {
    // Realtime hands back the DB row verbatim — `group_id`, `created_at`,
    // `deleted_at`. Casting it straight to CommunityMessage (which is the
    // backend's camelCase JSON shape) would produce a message whose every
    // field the UI reads is undefined.
    const { subscribeToGroupMessages } = loadRealtime();
    const onInsert = jest.fn();

    subscribeToGroupMessages('g1', onInsert);
    const insertHandler = mockChannel.on.mock.calls[0][2] as (p: unknown) => void;

    insertHandler({
      new: {
        id: 'm1',
        group_id: 'g1',
        user_id: 'user_2abc',
        body: 'hello',
        kind: 'text',
        opportunity_id: null,
        created_at: '2026-08-03T10:00:00.000Z',
        deleted_at: null,
        deleted_by: null,
      },
    });

    expect(onInsert).toHaveBeenCalledWith({
      id: 'm1',
      groupId: 'g1',
      userId: 'user_2abc',
      body: 'hello',
      kind: 'text',
      opportunityId: null,
      createdAt: '2026-08-03T10:00:00.000Z',
      deletedAt: null,
      deletedBy: null,
    });
  });

  it('delivers the moderator tombstone through the same callback', () => {
    // A soft delete is an UPDATE that blanks `body` and stamps `deleted_at`.
    // Without the UPDATE subscription the deleted text stays on every other
    // member's screen until they reload.
    const { subscribeToGroupMessages } = loadRealtime();
    const onChange = jest.fn();

    subscribeToGroupMessages('g1', onChange);
    const updateHandler = mockChannel.on.mock.calls[1][2] as (p: unknown) => void;

    updateHandler({
      new: {
        id: 'm1',
        group_id: 'g1',
        user_id: 'user_2abc',
        body: '',
        kind: 'text',
        opportunity_id: null,
        created_at: '2026-08-03T10:00:00.000Z',
        deleted_at: '2026-08-03T10:05:00.000Z',
        deleted_by: 'user_2mod',
      },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', body: '', deletedAt: '2026-08-03T10:05:00.000Z' }),
    );
  });

  it('ignores a payload with no row rather than emitting a blank message', () => {
    const { subscribeToGroupMessages } = loadRealtime();
    const onChange = jest.fn();

    subscribeToGroupMessages('g1', onChange);
    const insertHandler = mockChannel.on.mock.calls[0][2] as (p: unknown) => void;

    insertHandler({ new: null });
    insertHandler({});

    expect(onChange).not.toHaveBeenCalled();
  });
});
