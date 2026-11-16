export interface CommunityCallNotificationRoute { path: string; incoming: boolean }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['community-call-reminder', 'community-call-started', 'community-call-missed']);

export function getCommunityCallRouteFromNotification(data: Record<string, unknown> | null | undefined): CommunityCallNotificationRoute | null {
  if (!data || typeof data.kind !== 'string' || !KINDS.has(data.kind)) return null;
  const callId = typeof data.callId === 'string' ? data.callId : typeof data.call_id === 'string' ? data.call_id : '';
  const groupId = typeof data.groupId === 'string' ? data.groupId : typeof data.group_id === 'string' ? data.group_id : '';
  if (!UUID.test(callId) || !UUID.test(groupId)) return null;
  const incoming = data.kind === 'community-call-started';
  return { path: `/discussions/${groupId}/calls/${callId}${incoming ? '?incoming=1' : ''}`, incoming };
}

export function parseIncomingCallPayload(data: Record<string, unknown>): { callId: string; groupId: string; title: string; groupName: string; ringExpiresAt: string } | null {
  const route = getCommunityCallRouteFromNotification(data); if (!route?.incoming) return null;
  const callId = String(data.callId ?? data.call_id); const groupId = String(data.groupId ?? data.group_id);
  const title = typeof data.title === 'string' ? data.title.slice(0, 120) : 'Community voice call';
  const groupName = typeof data.groupName === 'string' ? data.groupName.slice(0, 120) : 'Edutu community';
  const ringExpiresAt = typeof data.ringExpiresAt === 'string' ? data.ringExpiresAt : typeof data.ring_expires_at === 'string' ? data.ring_expires_at : '';
  if (!ringExpiresAt || Number.isNaN(Date.parse(ringExpiresAt)) || Date.parse(ringExpiresAt) <= Date.now()) return null;
  return { callId, groupId, title, groupName, ringExpiresAt };
}
