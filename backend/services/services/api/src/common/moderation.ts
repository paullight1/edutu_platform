// Lightweight, self-contained content moderation for user-generated text
// (roadmap comments). Apple App Store Guideline 1.2 requires a method for
// filtering objectionable content from UGC. This is a wordlist + pattern
// check — deliberately dependency-free so it runs everywhere the API does.
//
// The severe safety patterns mirror `moderateUserMessage` in the mobile
// chat-proxy edge function; the profanity/slur wordlist is added here so a
// comment that is merely abusive (not just illegal) is also caught.

// Profanity / slurs / hateful terms. Matched as whole words, leet-normalized,
// so "f u c k", "sh!t" and "phuck" are caught too. Kept intentionally short
// and high-precision to avoid false positives on legitimate advice.
const OBJECTIONABLE_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "dickhead",
  "motherfucker",
  "bastard",
  "slut",
  "whore",
  "faggot",
  "nigger",
  "nigga",
  "retard",
  "rape",
  "pedophile",
  "kys",
];

// Severe / illegal-content patterns (ported from the chat-proxy moderator).
const OBJECTIONABLE_PATTERNS: RegExp[] = [
  /\b(sexual|nude|naked|porn|explicit)\b[\s\S]{0,50}\b(child|children|minor|underage|kid)\b/,
  /\b(child|children|minor|underage)\b[\s\S]{0,50}\b(sexual|nude|naked|porn|explicit)\b/,
  /\b(kill|hurt|harm)\s+(yourself|urself)\b/,
];

// Collapse common obfuscations so spacing/leet-speak can't slip a slur past
// the wordlist: lowercase, map digits/symbols to letters, strip separators
// between repeated letters.
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[$]/g, "s")
    .replace(/[!|1]/g, "i")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/[^a-z]/g, "");
}

/**
 * Returns true when the text contains profane, hateful, or otherwise
 * objectionable content that must be kept out of public comments.
 */
export function isObjectionable(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (OBJECTIONABLE_PATTERNS.some((pattern) => pattern.test(lower))) {
    return true;
  }
  const normalized = normalizeForMatch(text);
  return OBJECTIONABLE_WORDS.some((word) => normalized.includes(word));
}
