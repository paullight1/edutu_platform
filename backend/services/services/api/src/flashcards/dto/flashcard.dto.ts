export class CreateFlashcardDeckDto {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  difficulty?: "easy" | "medium" | "hard";
  sourceType?: "manual" | "ai_generated" | "imported";
  sourceId?: string;
}

export class CreateFlashcardDto {
  deckId: string;
  front: string;
  back: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
  mediaUrl?: string;
}

export class GenerateFlashcardsDto {
  topic: string;
  count?: number;
  difficulty?: "easy" | "medium" | "hard";
  sourceContent?: string;
}

export class UpdateFlashcardDeckDto {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  difficulty?: "easy" | "medium" | "hard";
}

export class UpdateFlashcardDto {
  front?: string;
  back?: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
  mediaUrl?: string;
}

export class ReviewFlashcardDto {
  quality: 0 | 1 | 2 | 3 | 4 | 5;
}

export class CreateStudySessionDto {
  deckId: string;
  cardsReviewed: number;
  correctCount: number;
  incorrectCount: number;
  durationSeconds: number;
}
