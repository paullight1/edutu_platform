const blockedSourcePatterns = [
  /to access (?:this|the) website/i,
  /please wait while we complete (?:a|the) security check/i,
  /checking your browser before accessing/i,
  /verify (?:that )?you are human/i,
  /i['’]m not a robot/i,
  /attention required\s*\|\s*cloudflare/i,
  /enable javascript and cookies to continue/i,
];

/** Reject common bot-protection pages mistakenly saved as opportunity copy. */
export function cleanOpportunityText(value?: string | null): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return blockedSourcePatterns.some((pattern) => pattern.test(text)) ? "" : text;
}
