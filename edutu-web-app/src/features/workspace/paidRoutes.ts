/** Keep web-only plan rules on their own aliases; mobile paths retain their contract. */
export function paidToolPath(path: string): string {
  return /^\/(chat|copilot|cv|goals|saved-searches|uploads)(?:\/|\?|$)/.test(
    path,
  ) ||
  /^\/roadmaps\/(?:ai|mine|adopt|enroll|my-enrollments|progress|intent|recommended|enrollments)(?:\/|\?|$)/.test(
    path,
  )
    ? `/web-tools${path}`
    : path;
}
