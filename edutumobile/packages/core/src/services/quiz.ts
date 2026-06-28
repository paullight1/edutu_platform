/**
 * Spaced Repetition Algorithm (SM-2)
 *
 * Implementation of the SuperMemo 2 algorithm for flashcard scheduling.
 * Cards are reviewed at increasing intervals based on performance.
 */

export interface FlashcardReview {
  cardId: string;
  ease: number;       // 1.3 (hard) to 2.5 (easy), default 2.5
  interval: number;   // days until next review
  repetitions: number; // number of successful recalls in a row
  nextReview: string;  // ISO date
  lastReview: string | null;
}

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

/**
 * Calculate next review date based on user's performance rating.
 *
 * @param card - Current flashcard state
 * @param quality - User rating: 0=complete blackout, 1=incorrect (recalled), 2=incorrect (easy recall),
 *                  3=correct (difficult), 4=correct (hesitant), 5=correct (perfect)
 * @returns Updated flashcard review state
 */
export function calculateNextReview(
  card: FlashcardReview,
  quality: number,
): FlashcardReview {
  let { ease, interval, repetitions } = card;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }

    repetitions++;
  } else {
    // Incorrect response — reset
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor
  ease = Math.max(
    MIN_EASE,
    ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    ...card,
    ease: Math.round(ease * 100) / 100,
    interval,
    repetitions,
    nextReview: nextReview.toISOString(),
    lastReview: new Date().toISOString(),
  };
}

/**
 * Get cards due for review today.
 */
export function getDueCards(cards: FlashcardReview[]): FlashcardReview[] {
  const now = new Date().toISOString();
  return cards.filter((c) => !c.nextReview || c.nextReview <= now);
}

/**
 * Calculate study session stats.
 */
export function calculateSessionStats(
  reviews: { quality: number }[],
): { total: number; correct: number; retention: number; avgQuality: number } {
  const total = reviews.length;
  const correct = reviews.filter((r) => r.quality >= 3).length;
  return {
    total,
    correct,
    retention: total > 0 ? Math.round((correct / total) * 100) : 0,
    avgQuality: total > 0 ? Math.round((reviews.reduce((s, r) => s + r.quality, 0) / total) * 10) / 10 : 0,
  };
}

/**
 * Create a new flashcard review state.
 */
export function createFlashcardReview(cardId: string): FlashcardReview {
  return {
    cardId,
    ease: DEFAULT_EASE,
    interval: 0,
    repetitions: 0,
    nextReview: new Date().toISOString(),
    lastReview: null,
  };
}
