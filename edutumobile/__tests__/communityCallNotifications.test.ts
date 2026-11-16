import { createShareLink, parseDeepLink } from '../packages/core/src/services/deepLinking';
import { getCommunityCallRouteFromNotification, parseIncomingCallPayload } from '../features/community-calls/notifications';
const callId='11111111-1111-4111-8111-111111111111'; const groupId='22222222-2222-4222-8222-222222222222';
describe('community call notification routing',()=>{
 it('routes a started call to incoming mode without changing opportunity routing',()=>{expect(getCommunityCallRouteFromNotification({kind:'community-call-started',callId,groupId})).toEqual({path:`/discussions/${groupId}/calls/${callId}?incoming=1`,incoming:true});expect(getCommunityCallRouteFromNotification({kind:'opportunity',opportunityId:'opp'})).toBeNull();});
 it('rejects stale rings but routes durable missed calls to summary',()=>{expect(parseIncomingCallPayload({kind:'community-call-started',callId,groupId,ringExpiresAt:'2020-01-01T00:00:00Z'})).toBeNull();expect(getCommunityCallRouteFromNotification({kind:'community-call-missed',call_id:callId,group_id:groupId})?.incoming).toBe(false);});
 it('round-trips community call deep links',()=>{const route={screen:'communityCall' as const,groupId,callId};const link=createShareLink(route);expect(link).toBe(`edutu://discussions/${groupId}/calls/${callId}`);expect(parseDeepLink(link)).toEqual(route);});
});
