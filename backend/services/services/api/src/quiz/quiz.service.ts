import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { quizzes, quizQuestions, quizAttempts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { GenerateQuizDto, SubmitQuizDto } from './dto/generate-quiz.dto';
import { AiService } from '../ai';

const QuizQuestionSchema = z.object({
  questionText: z.string(),
  options: z.array(z.string()).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional(),
});

const QuizResponseSchema = z.array(QuizQuestionSchema);

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(private readonly aiService: AiService) {}

  async generate(userId: string, dto: GenerateQuizDto) {
    const questionCount = dto.questionCount || 5;
    const difficulty = dto.difficulty || 'medium';

    const prompt = `
You are an expert quiz creator. Generate a ${difficulty} level quiz about "${dto.topic}".

Create exactly ${questionCount} multiple choice questions. Each question should have exactly 4 options.

Output ONLY a valid JSON array with this structure:
[
    {
        "questionText": "The question text here",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 0,
        "explanation": "Brief explanation of why this answer is correct"
    }
]

Requirements:
- Questions should be educational and relevant to the topic
- All 4 options should be plausible but only one correct
- correctIndex must be 0, 1, 2, or 3 (indexing the correct answer in options array)
- Include a brief explanation for each answer
${dto.description ? `- Additional context: ${dto.description}` : ''}
        `.trim();

    try {
      const parsedJson = await this.aiService.generateJson({
        feature: 'quiz.generate',
        prompt,
        responseMimeType: 'application/json',
        metadata: { userId, topic: dto.topic, difficulty },
      });

      if (!parsedJson) {
        throw new Error('AI returned empty response');
      }

      const result = QuizResponseSchema.safeParse(parsedJson);
      if (!result.success) {
        this.logger.error(
          'Quiz generation failed Zod validation',
          result.error,
        );
        throw new Error('Failed to generate valid quiz questions');
      }

      const [newQuiz] = await db
        .insert(quizzes)
        .values({
          userId,
          title: `Quiz: ${dto.topic}`,
          description: dto.description,
          topic: dto.topic,
          difficulty,
          questionCount: result.data.length,
          status: 'generated',
        })
        .returning();

      for (let i = 0; i < result.data.length; i++) {
        const q = result.data[i];
        await db.insert(quizQuestions).values({
          quizId: newQuiz.id,
          questionText: q.questionText,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation || null,
          order: i,
        });
      }

      return this.findOne(userId, newQuiz.id);
    } catch (err) {
      this.logger.error('Quiz generation failed', err);
      throw err;
    }
  }

  async findAllByUser(userId: string) {
    return db.select().from(quizzes).where(eq(quizzes.userId, userId));
  }

  async findOne(userId: string, id: string) {
    const quizResult = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)));
    if (!quizResult.length) return null;

    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id));

    return {
      ...quizResult[0],
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        order: q.order,
      })),
    };
  }

  async findOneWithAnswers(userId: string, id: string) {
    const quizResult = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)));
    if (!quizResult.length) return null;

    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id));

    return {
      ...quizResult[0],
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        order: q.order,
      })),
    };
  }

  async submit(userId: string, quizId: string, dto: SubmitQuizDto) {
    const quiz = await this.findOneWithAnswers(userId, quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    let score = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (quiz.questions[i].correctIndex === dto.answers[i]) {
        score++;
      }
    }

    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        quizId,
        userId,
        answers: dto.answers.map(String),
        score,
        totalQuestions: quiz.questions.length,
        completedAt: new Date(),
      })
      .returning();

    await db
      .update(quizzes)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(quizzes.id, quizId));

    return {
      attempt,
      score,
      totalQuestions: quiz.questions.length,
      percentage: Math.round((score / quiz.questions.length) * 100),
      results: quiz.questions.map((q, i) => ({
        questionText: q.questionText,
        correct: q.correctIndex === dto.answers[i],
        correctAnswer: q.options[q.correctIndex],
        yourAnswer: q.options[dto.answers[i]],
        explanation: q.explanation,
      })),
    };
  }

  async getAttempts(userId: string, quizId: string) {
    return db
      .select()
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId)),
      );
  }

  async remove(id: string) {
    await db.delete(quizzes).where(eq(quizzes.id, id));
    return { success: true };
  }
}
