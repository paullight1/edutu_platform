/**
 * A complete-enough Supabase client mock for jest.
 *
 * The credits / pro-status / billing hooks call a wide surface — `from(...)`
 * query-builder chains, `rpc(...)`, and realtime `channel(...)` /
 * `getChannels()` / `removeChannel()`. A partial `{}` mock makes those throw
 * ("supabase.from is not a function", "getChannels is not a function"), which
 * cascades into render failures. Use this as the base and pass `overrides`
 * (e.g. a custom `from`) for suite-specific data.
 */
export function createSupabaseMock(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  channel.unsubscribe = () => channel;
  channel.send = () => channel;

  const result = { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const chainMethods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike', 'order', 'limit', 'range', 'match',
    'filter', 'or', 'not', 'contains', 'overlaps', 'textSearch',
  ];
  for (const method of chainMethods) {
    builder[method] = () => builder;
  }
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  // Make the builder awaitable (resolves like a terminal query).
  builder.then = (resolve: (value: typeof result) => unknown) => resolve(result);

  return {
    from: () => builder,
    rpc: async () => ({ data: null, error: null }),
    channel: () => channel,
    getChannels: () => [],
    removeChannel: () => {},
    removeAllChannels: () => {},
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
    ...overrides,
  };
}
