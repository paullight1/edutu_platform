import { renderHook, waitFor } from '@testing-library/react-native';
import { useCreatorAccess } from '../packages/core/src/hooks/useCreatorAccess';

type Profile = {
  user_id: string;
  creator_status: 'none' | 'pending' | 'approved' | 'rejected';
  mentor_status: 'none' | 'pending' | 'approved' | 'rejected';
};

function createSupabase(result: { data: Profile[] | null; error: Error | null }) {
  const query = {
    select: jest.fn(() => query),
    in: jest.fn(() => Promise.resolve(result)),
  };

  return {
    from: jest.fn(() => query),
    query,
  };
}

describe('useCreatorAccess', () => {
  it('grants Mentor Studio access when mentor_status is approved', async () => {
    const supabase = createSupabase({
      data: [{
        user_id: 'mentor-user-1',
        creator_status: 'none',
        mentor_status: 'approved',
      }],
      error: null,
    });

    const { result } = renderHook(() => useCreatorAccess(supabase as any, 'mentor-user-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.status).toBe('approved');
    expect(result.current.isApproved).toBe(true);
    expect(result.current.error).toBeNull();
    expect(supabase.query.select).toHaveBeenCalledWith('user_id, creator_status, mentor_status');
  });

  it('preserves Creator Studio access when creator_status is approved', async () => {
    const supabase = createSupabase({
      data: [{
        user_id: 'creator-user-1',
        creator_status: 'approved',
        mentor_status: 'none',
      }],
      error: null,
    });

    const { result } = renderHook(() => useCreatorAccess(supabase as any, 'creator-user-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.status).toBe('approved');
    expect(result.current.isApproved).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('stops loading and exposes a retryable error when the lookup fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const supabase = createSupabase({
      data: null,
      error: new Error('profiles unavailable'),
    });

    try {
      const { result } = renderHook(() => useCreatorAccess(supabase as any, 'user-1'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.status).toBeNull();
      expect(result.current.isApproved).toBe(false);
      expect(result.current.error).toBe('profiles unavailable');
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
