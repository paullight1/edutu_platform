import {
  buildReferralLink,
  buildReferralMessage,
  getMyReferralCode,
  getReferralStats,
  isTerminalRedeemStatus,
  redeemReferral,
  REFERRAL_LINK_HOST,
  RedeemStatus,
} from '../packages/core/src/services/referrals';

function makeSupabase(rpc: jest.Mock) {
  return { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('referral link building', () => {
  it('builds a universal invite link that pre-fills the code', () => {
    expect(buildReferralLink('ABC12345')).toBe(
      `${REFERRAL_LINK_HOST}/invite?code=ABC12345`,
    );
  });

  it('url-encodes the code', () => {
    expect(buildReferralLink('a b&c')).toBe(
      `${REFERRAL_LINK_HOST}/invite?code=a%20b%26c`,
    );
  });

  it('embeds the code and link in the share message', () => {
    const msg = buildReferralMessage('ABC12345');
    expect(msg).toContain('ABC12345');
    expect(msg).toContain(buildReferralLink('ABC12345'));
  });
});

describe('getMyReferralCode', () => {
  it('returns the code string from the RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'CODE1234', error: null });
    await expect(getMyReferralCode(makeSupabase(rpc))).resolves.toBe('CODE1234');
    expect(rpc).toHaveBeenCalledWith('get_or_create_my_referral_code');
  });

  it('returns null on RPC error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getMyReferralCode(makeSupabase(rpc))).resolves.toBeNull();
  });
});

describe('redeemReferral', () => {
  it('rejects an empty code without calling the RPC', async () => {
    const rpc = jest.fn();
    await expect(redeemReferral(makeSupabase(rpc), '  ')).resolves.toBe('invalid_code');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the trimmed code and returns the server status', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { status: 'pending' }, error: null });
    await expect(redeemReferral(makeSupabase(rpc), '  ABC12345 ')).resolves.toBe('pending');
    expect(rpc).toHaveBeenCalledWith('redeem_referral', { p_code: 'ABC12345' });
  });

  it('maps an RPC error to a retryable "error" status', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'net' } });
    await expect(redeemReferral(makeSupabase(rpc), 'ABC12345')).resolves.toBe('error');
  });
});

describe('isTerminalRedeemStatus', () => {
  it('treats every status except "error" as terminal', () => {
    const terminal: RedeemStatus[] = ['pending', 'invalid_code', 'self', 'already_redeemed', 'too_late'];
    terminal.forEach((s) => expect(isTerminalRedeemStatus(s)).toBe(true));
    expect(isTerminalRedeemStatus('error')).toBe(false);
  });
});

describe('getReferralStats', () => {
  it('coerces the RPC payload to numbers', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { total: '3', completed: '2', pending: '1', creditsEarned: '20' },
      error: null,
    });
    await expect(getReferralStats(makeSupabase(rpc))).resolves.toEqual({
      total: 3,
      completed: 2,
      pending: 1,
      creditsEarned: 20,
    });
  });

  it('returns zeroed stats on error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(getReferralStats(makeSupabase(rpc))).resolves.toEqual({
      total: 0,
      completed: 0,
      pending: 0,
      creditsEarned: 0,
    });
  });
});
