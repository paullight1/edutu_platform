/** Keep web-only plan rules on their own aliases; mobile paths retain their contract. */
export function paidToolPath(path: string): string {
  if (/^\/opportunities\/(recommendations|match-scores)(?:\/|\?|$)/.test(path)) {
    return `/web-tools${path}`;
  }

  return /^\/(chat|copilot|cv|documents|goals|saved-searches|uploads)(?:\/|\?|$)/.test(
    path,
  ) ||
  /^\/roadmaps\/(?:ai|mine|adopt|enroll|my-enrollments|progress|intent|recommended|enrollments)(?:\/|\?|$)/.test(
    path,
  )
    ? `/web-tools${path}`
    : path;
}
