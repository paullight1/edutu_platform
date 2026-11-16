import { canManageCommunityCall, fetchCommunityCallJoinToken, validateSignalingUrl } from '../features/community-calls/api';

const CALL_ID='11111111-1111-4111-8111-111111111111';
describe('community call API',()=>{
 beforeEach(()=>{global.fetch=jest.fn() as jest.Mock;});
 it('keeps the join token in the return value and uses the per-call WSS URL',async()=>{
  (global.fetch as jest.Mock).mockResolvedValue({ok:true,status:200,json:async()=>({token:'ephemeral',signaling_url:'wss://voice-2.edutu.org/ws/calls/room-7',expires_at:'2026-08-06T19:00:00.000Z'})});
  const result=await fetchCommunityCallJoinToken(CALL_ID,async()=> 'clerk');
  expect(result).toEqual({token:'ephemeral',signalingUrl:'wss://voice-2.edutu.org/ws/calls/room-7',expiresAt:'2026-08-06T19:00:00.000Z'});
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(`/communities/calls/${CALL_ID}/join-token`),expect.objectContaining({method:'POST'}));
 });
 it('rejects insecure remote signaling and accepts loopback ws in development',()=>{
  expect(()=>validateSignalingUrl('ws://voice.edutu.org/ws')).toThrow(/insecure/i);
  expect(validateSignalingUrl('ws://127.0.0.1:4443/ws')).toBe('ws://127.0.0.1:4443/ws');
 });
 it('gates scheduling and lifecycle controls to owners and moderators',()=>{
  expect(canManageCommunityCall('owner')).toBe(true); expect(canManageCommunityCall('mod')).toBe(true); expect(canManageCommunityCall('member')).toBe(false); expect(canManageCommunityCall(null)).toBe(false);
 });
});
