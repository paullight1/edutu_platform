const attemptIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const attemptPathPattern = /^\/auto-apply\/([a-f0-9-]+)$/i;

function isConfirmedReceipt(data?: Record<string, unknown>) {
  return data?.source === 'application-status' && data.status === 'submitted' && data.submissionVerified === true;
}

export function autoApplyNotificationAttemptId(data?: Record<string, unknown>): string | null | undefined {
  if (data?.source !== 'auto-apply-action' && data?.source !== 'auto-apply-progress' && !isConfirmedReceipt(data)) return undefined;

  // Older Android progress cards carried only a local path.
  const legacyId = data?.source === 'auto-apply-progress' && typeof data.url === 'string'
    ? attemptPathPattern.exec(data.url)?.[1]
    : undefined;
  const id = data?.attemptId ?? legacyId;
  return typeof id === 'string' && attemptIdPattern.test(id) ? id : null;
}

export function autoApplyNotificationRoute(data?: Record<string, unknown>): string | undefined {
  const id = autoApplyNotificationAttemptId(data);
  if (id === undefined) return undefined;
  if (!id) return '/notifications';
  const version = data?.source === 'auto-apply-progress' ? data.version : data?.attemptVersion;
  const path = '/auto-apply/' + id;
  return typeof version === 'number' && Number.isSafeInteger(version) && version > 0
    ? path + '?notice=' + version
    : path;
}
