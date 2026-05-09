import { Injectable } from '@nestjs/common';
import { db } from '../db';
import {
  flashcardDecks,
  flashcards,
  flashcardReviews,
  flashcardStudySessions,
} from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  CreateFlashcardDeckDto,
  CreateFlashcardDto,
  UpdateFlashcardDeckDto,
  UpdateFlashcardDto,
  ReviewFlashcardDto,
  CreateStudySessionDto,
  GenerateFlashcardsDto,
} from './dto';

@Injectable()
export class FlashcardsService {
  async findAllDecksByUser(userId: string) {
    return await db
      .select()
      .from(flashcardDecks)
      .where(eq(flashcardDecks.userId, userId))
      .orderBy(desc(flashcardDecks.updatedAt));
  }

  async findPublicDecks(limit = 20, offset = 0) {
    return await db
      .select()
      .from(flashcardDecks)
      .where(eq(flashcardDecks.isPublic, true))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(flashcardDecks.updatedAt));
  }

  async findDeckById(id: string, userId?: string) {
    const conditions = [eq(flashcardDecks.id, id)];
    if (userId) {
      conditions.push(eq(flashcardDecks.userId, userId));
    }

    const deckResult = await db
      .select()
      .from(flashcardDecks)
      .where(and(...conditions));

    if (!deckResult.length) return null;
    return deckResult[0];
  }

  async findDeckWithCards(id: string) {
    const deck = await this.findDeckById(id);
    if (!deck) return null;

    const cards = await db
      .select()
      .from(flashcards)
      .where(eq(flashcards.deckId, id))
      .orderBy(flashcards.order);

    return { ...deck, cards };
  }

  async createDeck(userId: string, dto: CreateFlashcardDeckDto) {
    const [deck] = await db
      .insert(flashcardDecks)
      .values({
        userId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        tags: dto.tags || [],
        isPublic: dto.isPublic ?? false,
        difficulty: dto.difficulty ?? 'medium',
        sourceType: dto.sourceType ?? 'manual',
        sourceId: dto.sourceId,
      })
      .returning();
    return deck;
  }

  async updateDeck(id: string, dto: UpdateFlashcardDeckDto) {
    const [updated] = await db
      .update(flashcardDecks)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(flashcardDecks.id, id))
      .returning();
    return updated;
  }

  async deleteDeck(id: string) {
    await db.delete(flashcardDecks).where(eq(flashcardDecks.id, id));
    return { success: true };
  }

  async createCard(dto: CreateFlashcardDto) {
    const [card] = await db
      .insert(flashcards)
      .values({
        deckId: dto.deckId,
        front: dto.front,
        back: dto.back,
        hint: dto.hint,
        difficulty: dto.difficulty ?? 'medium',
        tags: dto.tags || [],
        mediaUrl: dto.mediaUrl,
      })
      .returning();

    await this.updateDeckCardCount(dto.deckId);
    return card;
  }

  async createCards(cards: CreateFlashcardDto[]) {
    if (!cards.length) return [];

    const insertedCards = await db
      .insert(flashcards)
      .values(
        cards.map((c, i) => ({
          deckId: c.deckId,
          front: c.front,
          back: c.back,
          hint: c.hint,
          difficulty: c.difficulty ?? 'medium',
          tags: c.tags || [],
          mediaUrl: c.mediaUrl,
          order: i,
        })),
      )
      .returning();

    if (cards[0]?.deckId) {
      await this.updateDeckCardCount(cards[0].deckId);
    }
    return insertedCards;
  }

  async updateCard(id: string, dto: UpdateFlashcardDto) {
    const [updated] = await db
      .update(flashcards)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(flashcards.id, id))
      .returning();
    return updated;
  }

  async deleteCard(id: string) {
    const [card] = await db
      .select()
      .from(flashcards)
      .where(eq(flashcards.id, id));

    if (card) {
      await db.delete(flashcards).where(eq(flashcards.id, id));
      await this.updateDeckCardCount(card.deckId);
    }
    return { success: true };
  }

  async getCardsForReview(deckId: string, userId: string, limit = 20) {
    const now = new Date();
    const cards = await db
      .select({
        card: flashcards,
        review: flashcardReviews,
      })
      .from(flashcards)
      .leftJoin(
        flashcardReviews,
        and(
          eq(flashcardReviews.cardId, flashcards.id),
          eq(flashcardReviews.userId, userId),
        ),
      )
      .where(eq(flashcards.deckId, deckId))
      .orderBy(flashcards.order)
      .limit(limit);

    return cards.map(({ card, review }) => ({
      ...card,
      review: review || null,
      needsReview:
        !review || !review.nextReviewAt || review.nextReviewAt <= now,
    }));
  }

  async reviewCard(cardId: string, userId: string, dto: ReviewFlashcardDto) {
    const quality = dto.quality;
    const existingReviews = await db
      .select()
      .from(flashcardReviews)
      .where(
        and(
          eq(flashcardReviews.cardId, cardId),
          eq(flashcardReviews.userId, userId),
        ),
      );

    const now = new Date();
    let easeFactor: number;
    let interval: number;
    let repetitions: number;

    if (!existingReviews.length) {
      easeFactor = 250;
      repetitions = 0;
      interval = 0;
    } else {
      const existing = existingReviews[0];
      easeFactor = existing.easeFactor || 250;
      repetitions = existing.repetitions || 0;
      interval = existing.interval || 0;
    }

    if (quality >= 3) {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * (easeFactor / 100));
      }
      repetitions += 1;
    } else {
      repetitions = 0;
      interval = 1;
    }

    easeFactor = Math.max(130, easeFactor + (quality - 3) * 20);
    const nextReviewAt = new Date(now);
    nextReviewAt.setDate(nextReviewAt.getDate() + interval);

    const [review] = await db
      .insert(flashcardReviews)
      .values({
        cardId,
        userId,
        easeFactor,
        interval,
        repetitions,
        nextReviewAt,
        lastReviewAt: now,
      })
      .onConflictDoUpdate({
        target: [flashcardReviews.cardId, flashcardReviews.userId],
        set: {
          easeFactor,
          interval,
          repetitions,
          nextReviewAt,
          lastReviewAt: now,
          updatedAt: now,
        },
      })
      .returning();

    return review;
  }

  async createStudySession(userId: string, dto: CreateStudySessionDto) {
    const [session] = await db
      .insert(flashcardStudySessions)
      .values({
        deckId: dto.deckId,
        userId,
        cardsReviewed: dto.cardsReviewed,
        correctCount: dto.correctCount,
        incorrectCount: dto.incorrectCount,
        durationSeconds: dto.durationSeconds,
        completedAt: new Date(),
      })
      .returning();
    return session;
  }

  async getStudyStats(userId: string) {
    const sessions = await db
      .select()
      .from(flashcardStudySessions)
      .where(eq(flashcardStudySessions.userId, userId));

    const totalSessions = sessions.length;
    const totalCardsReviewed = sessions.reduce(
      (sum, s) => sum + (s.cardsReviewed || 0),
      0,
    );
    const totalCorrect = sessions.reduce(
      (sum, s) => sum + (s.correctCount || 0),
      0,
    );
    const totalIncorrect = sessions.reduce(
      (sum, s) => sum + (s.incorrectCount || 0),
      0,
    );
    const totalDuration = sessions.reduce(
      (sum, s) => sum + (s.durationSeconds || 0),
      0,
    );

    return {
      totalSessions,
      totalCardsReviewed,
      totalCorrect,
      totalIncorrect,
      totalDurationSeconds: totalDuration,
      averageAccuracy:
        totalCardsReviewed > 0
          ? Math.round((totalCorrect / totalCardsReviewed) * 100)
          : 0,
    };
  }

  async generateFlashcards(dto: GenerateFlashcardsDto) {
    const count = dto.count || 10;
    const difficulty = dto.difficulty || 'medium';
    const topic = dto.topic;
    const sourceContent = dto.sourceContent;

    const generatedCards: Array<{
      front: string;
      back: string;
      hint?: string;
    }> = [];

    if (sourceContent) {
      const sentences = sourceContent
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 20);
      const keyConcepts = this.extractKeyConcepts(sourceContent);

      for (let i = 0; i < Math.min(count, keyConcepts.length); i++) {
        const concept = keyConcepts[i];
        generatedCards.push({
          front: `What is ${concept.term}?`,
          back: concept.definition,
          hint: concept.hint,
        });
      }
    }

    if (generatedCards.length < count) {
      const topicCards = this.generateTopicCards(
        topic,
        count - generatedCards.length,
        difficulty,
      );
      generatedCards.push(...topicCards);
    }

    return {
      topic,
      difficulty,
      cards: generatedCards.slice(0, count),
    };
  }

  private extractKeyConcepts(
    content: string,
  ): Array<{ term: string; definition: string; hint?: string }> {
    const concepts: Array<{ term: string; definition: string; hint?: string }> =
      [];

    const definitionPatterns = [
      /([A-Z][a-zA-Z\s]+)\s+(?:is|are|refers to|means|can be defined as)\s+([^.]+)/gi,
      /([A-Z][a-zA-Z\s]+):\s+([^.]+)/g,
    ];

    for (const pattern of definitionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const term = match[1].trim();
        const definition = match[2].trim();
        if (term.length > 2 && term.length < 50 && definition.length > 10) {
          concepts.push({ term, definition });
        }
      }
    }

    return concepts;
  }

  private generateTopicCards(
    topic: string,
    count: number,
    difficulty: string,
  ): Array<{ front: string; back: string; hint?: string }> {
    const cards: Array<{ front: string; back: string; hint?: string }> = [];

    const templates = [
      {
        front: `Define ${topic}`,
        back: `${topic} is a fundamental concept that requires understanding of its core principles and applications.`,
      },
      {
        front: `What are the key components of ${topic}?`,
        back: `The key components include foundational elements, practical applications, and advanced concepts.`,
      },
      {
        front: `How does ${topic} relate to similar concepts?`,
        back: `${topic} connects to related fields through shared principles and methodologies.`,
      },
      {
        front: `What are common misconceptions about ${topic}?`,
        back: `A common misconception is oversimplifying its complexity or misapplying its principles.`,
      },
      {
        front: `Explain the practical applications of ${topic}`,
        back: `${topic} has applications in real-world scenarios, problem-solving, and decision-making.`,
      },
      {
        front: `What are the prerequisites for understanding ${topic}?`,
        back: `Understanding ${topic} requires foundational knowledge and analytical thinking skills.`,
      },
      {
        front: `Describe the historical context of ${topic}`,
        back: `${topic} has evolved through research, practice, and technological advancement.`,
      },
      {
        front: `What are the challenges in mastering ${topic}?`,
        back: `Challenges include complexity, abstract concepts, and keeping up with developments.`,
      },
      {
        front: `How is ${topic} applied in industry?`,
        back: `${topic} is applied in various industries for optimization, innovation, and problem-solving.`,
      },
      {
        front: `What future trends are expected in ${topic}?`,
        back: `Future trends include integration with new technologies and expanded applications.`,
      },
    ];

    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      cards.push({
        ...shuffled[i],
        hint: `Think about the core aspects of ${topic}`,
      });
    }

    return cards;
  }

  private async updateDeckCardCount(deckId: string) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(flashcards)
      .where(eq(flashcards.deckId, deckId));

    const count = result[0]?.count || 0;
    await db
      .update(flashcardDecks)
      .set({ cardCount: count, updatedAt: new Date() })
      .where(eq(flashcardDecks.id, deckId));
  }
}
