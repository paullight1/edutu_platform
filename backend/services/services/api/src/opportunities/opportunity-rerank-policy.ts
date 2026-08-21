export type OpportunityRerankCandidateInput = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  fundingType?: string | null;
  targetRegion?: string | null;
  match: number;
};

export type CompactOpportunityRerankCandidate = {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  fundingType: string | null;
  targetRegion: string | null;
  heuristicScore: number;
};

const RERANK_HEURISTIC_WEIGHT = 0.6;
const RERANK_AI_WEIGHT = 0.4;
const MAX_RERANK_SUMMARY_CHARS = 320;
const MAX_RERANK_TITLE_CHARS = 200;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function compactText(value: string | null | undefined, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

/**
 * Blend a deterministic soft score with the AI reranker. Hard eligibility
 * remains outside this function, while the soft score is intentionally allowed
 * to move in either direction when semantic evidence disagrees.
 */
export function blendOpportunityRerankScore(
  heuristicScore: number,
  aiScore: number,
): number {
  const blended =
    clampScore(heuristicScore) * RERANK_HEURISTIC_WEIGHT +
    clampScore(aiScore) * RERANK_AI_WEIGHT;
  return clampScore(Math.round(blended));
}

/**
 * Keep untrusted scraped prose out of the reranker except for a short normalized
 * excerpt. This reduces prompt size and limits prompt-like text from a source.
 */
export function compactOpportunityForRerank(
  candidate: OpportunityRerankCandidateInput,
): CompactOpportunityRerankCandidate {
  return {
    id: candidate.id,
    title: compactText(candidate.title, MAX_RERANK_TITLE_CHARS),
    summary: compactText(candidate.description, MAX_RERANK_SUMMARY_CHARS),
    category: candidate.category ?? null,
    fundingType: candidate.fundingType ?? null,
    targetRegion: candidate.targetRegion ?? null,
    heuristicScore: clampScore(candidate.match),
  };
}
