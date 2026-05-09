import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { db } from '../db';
import {
  roadmaps,
  roadmapEnrollments,
  userRoadmapIntents,
  roadmapFeedback,
} from '../db/schema';
import { eq, and, or, ilike, desc, gte, sql } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import {
  CreateRoadmapDto,
  UpdateRoadmapDto,
  RoadmapIntentDto,
  RoadmapFeedbackDto,
  AIAssistDto,
} from './dto/roadmap.dto';

@Injectable()
export class RoadmapsService {
  private readonly logger = new Logger(RoadmapsService.name);
  private readonly ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  async findAll(params?: {
    status?: string;
    category?: string;
    difficulty?: string;
    search?: string;
    featured?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const {
      status = 'published',
      category,
      difficulty,
      search,
      featured,
      limit = 20,
      offset = 0,
    } = params || {};

    const cappedLimit = Math.min(limit, 100);
    const conditions = [eq(roadmaps.status, status)];

    if (category) conditions.push(eq(roadmaps.category, category));
    if (difficulty) conditions.push(eq(roadmaps.difficulty, difficulty));
    if (featured) conditions.push(eq(roadmaps.isFeatured, true));
    if (search) conditions.push(ilike(roadmaps.title, `%${search}%`));

    const items = await db
      .select()
      .from(roadmaps)
      .where(and(...conditions))
      .orderBy(
        roadmaps.isFeatured,
        desc(roadmaps.ratingAvg),
        desc(roadmaps.enrollmentCount),
        desc(roadmaps.createdAt),
      )
      .limit(cappedLimit)
      .offset(offset);

    return items;
  }

  async findOne(id: string) {
    const [item] = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.id, id));

    if (!item) throw new NotFoundException('Roadmap not found');
    return item;
  }

  async findBySlug(slug: string) {
    const [item] = await db
      .select()
      .from(roadmaps)
      .where(and(eq(roadmaps.slug, slug), eq(roadmaps.status, 'published')));

    if (!item) throw new NotFoundException('Roadmap not found');
    return item;
  }

  async create(dto: CreateRoadmapDto, userId: string, creatorName = 'Edutu Admin') {
    const steps = dto.steps.map((step) => ({
      ...step,
      id: step.id || crypto.randomUUID(),
      resources: step.resources || [],
    }));

    const resources = (dto.resources || []).map((res) => ({
      ...res,
      id: res.id || crypto.randomUUID(),
      url: res.url || '',
    }));

    let aiIntentTags: string[] = [];
    let aiGeneratedSummary: string | null = null;

    if (this.ai) {
      try {
        const aiResult = await this.generateIntentTags(dto);
        aiIntentTags = aiResult.tags;
        aiGeneratedSummary = aiResult.summary;
      } catch (e) {
        this.logger.warn('AI intent generation failed, continuing without it', e instanceof Error ? e.message : String(e));
      }
    }

    const [item] = await db
      .insert(roadmaps)
      .values({
        title: dto.title,
        slug: dto.slug || `${dto.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${crypto.randomUUID().slice(0, 6)}`,
        description: dto.description,
        category: dto.category,
        difficulty: dto.difficulty,
        estimatedDuration: dto.estimatedDuration || null,
        targetAudience: dto.targetAudience || null,
        prerequisites: dto.prerequisites || null,
        outcomes: dto.outcomes || null,
        coverImage: dto.coverImage || null,
        createdBy: userId,
        creatorName,
        isFeatured: dto.isFeatured,
        steps: steps,
        resources: resources,
        relatedOpportunities: dto.relatedOpportunities,
        aiIntentTags,
        aiGeneratedSummary,
      })
      .returning();

    return item;
  }

  async update(id: string, dto: UpdateRoadmapDto) {
    const existing = await this.findOne(id);

    const updateData: Record<string, unknown> = {
      ...dto,
      updatedAt: new Date(),
    };

    if (dto.status === 'published' && existing.status !== 'published') {
      updateData.publishedAt = new Date();
    }

    if (dto.steps) {
      updateData.steps = dto.steps.map((step) => ({
        ...step,
        id: step.id || crypto.randomUUID(),
        resources: step.resources || [],
      }));
    }

    if (dto.resources) {
      updateData.resources = dto.resources.map((res) => ({
        ...res,
        id: res.id || crypto.randomUUID(),
        url: res.url || '',
      }));
    }

    delete updateData.status;
    if (dto.status) {
      updateData.status = dto.status;
    }

    const [updated] = await db
      .update(roadmaps)
      .set(updateData)
      .where(eq(roadmaps.id, id))
      .returning();

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await db.delete(roadmaps).where(eq(roadmaps.id, id));
    return { success: true, id };
  }

  async enroll(userId: string, roadmapId: string) {
    await this.findOne(roadmapId);

    const [enrollment] = await db
      .insert(roadmapEnrollments)
      .values({
        userId,
        roadmapId,
        status: 'enrolled',
        progress: 0,
        currentStep: 0,
        completedSteps: [],
      })
      .onConflictDoUpdate({
        target: [roadmapEnrollments.userId, roadmapEnrollments.roadmapId],
        set: {
          status: 'enrolled',
          enrolledAt: new Date(),
        },
      })
      .returning();

    await db
      .update(roadmaps)
      .set({ enrollmentCount: sql`${roadmaps.enrollmentCount} + 1` })
      .where(eq(roadmaps.id, roadmapId));

    return enrollment;
  }

  async getUserEnrollments(userId: string) {
    return db
      .select({
        enrollment: roadmapEnrollments,
        roadmap: roadmaps,
      })
      .from(roadmapEnrollments)
      .innerJoin(roadmaps, eq(roadmapEnrollments.roadmapId, roadmaps.id))
      .where(eq(roadmapEnrollments.userId, userId))
      .orderBy(desc(roadmapEnrollments.enrolledAt));
  }

  async updateProgress(userId: string, roadmapId: string, stepId: string, completed: boolean) {
    const [enrollment] = await db
      .select()
      .from(roadmapEnrollments)
      .where(
        and(
          eq(roadmapEnrollments.userId, userId),
          eq(roadmapEnrollments.roadmapId, roadmapId),
        ),
      );

    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const roadmap = await this.findOne(roadmapId);
    const steps = roadmap.steps as Array<{ id: string }>;
    const stepIndex = steps.findIndex((s) => s.id === stepId);

    let completedSteps = (enrollment.completedSteps as string[]) || [];

    if (completed) {
      if (!completedSteps.includes(stepId)) {
        completedSteps.push(stepId);
      }
    } else {
      completedSteps = completedSteps.filter((id) => id !== stepId);
    }

    const progress = steps.length > 0
      ? Math.round((completedSteps.length / steps.length) * 100)
      : 0;

    const [updated] = await db
      .update(roadmapEnrollments)
      .set({
        progress,
        currentStep: stepIndex,
        completedSteps,
        completedAt: progress === 100 ? new Date() : null,
      })
      .where(eq(roadmapEnrollments.id, enrollment.id))
      .returning();

    return updated;
  }

  async saveIntent(userId: string, dto: RoadmapIntentDto) {
    const [intent] = await db
      .insert(userRoadmapIntents)
      .values({
        userId,
        ...dto,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userRoadmapIntents.userId,
        set: {
          ...dto,
          updatedAt: new Date(),
        },
      })
      .returning();

    return intent;
  }

  async getIntent(userId: string) {
    const [intent] = await db
      .select()
      .from(userRoadmapIntents)
      .where(eq(userRoadmapIntents.userId, userId));

    return intent || null;
  }

  async getRecommendedRoadmaps(userId: string, limit = 10) {
    const intent = await this.getIntent(userId);
    const cappedLimit = Math.min(limit, 50);

    const conditions = [eq(roadmaps.status, 'published')];

    if (intent?.targetCategory) {
      conditions.push(eq(roadmaps.category, intent.targetCategory));
    }

    const items = await db
      .select()
      .from(roadmaps)
      .where(and(...conditions))
      .orderBy(
        roadmaps.isFeatured,
        desc(roadmaps.ratingAvg),
        desc(roadmaps.enrollmentCount),
        desc(roadmaps.createdAt),
      )
      .limit(cappedLimit);

    if (this.ai && intent) {
      try {
        const scored = await this.scoreRoadmapIntentMatch(items, intent);
        return scored.slice(0, cappedLimit);
      } catch (e) {
        this.logger.warn('AI scoring failed, returning unsorted results');
      }
    }

    return items;
  }

  async submitFeedback(userId: string, dto: RoadmapFeedbackDto) {
    const [feedback] = await db
      .insert(roadmapFeedback)
      .values({
        userId,
        roadmapId: dto.roadmapId,
        satisfactionScore: dto.satisfactionScore,
        metExpectations: dto.metExpectations,
        whatWorked: dto.whatWorked,
        whatImproved: dto.whatImproved,
        wouldRecommend: dto.wouldRecommend,
      })
      .returning();

    await this.updateRoadmapRating(dto.roadmapId, dto.satisfactionScore);

    return feedback;
  }

  async getStats() {
    const result = await db.execute(sql`
      select
        (select count(*) from roadmaps) as total_roadmaps,
        (select count(*) from roadmaps where status = 'published') as published_roadmaps,
        (select count(*) from roadmaps where status = 'draft') as draft_roadmaps,
        (select count(*) from roadmap_enrollments) as total_enrollments,
        (select avg(satisfaction_score) from roadmap_feedback) as avg_satisfaction
    `);

    return result[0] || {
      total_roadmaps: 0,
      published_roadmaps: 0,
      draft_roadmaps: 0,
      total_enrollments: 0,
      avg_satisfaction: 0,
    };
  }

  async getFeedbackSummary(roadmapId: string) {
    const results = await db.execute(sql`
      select
        count(*) as total_feedback,
        avg(satisfaction_score) as avg_score,
        count(*) filter (where met_expectations = true) as met_expectations_count,
        count(*) filter (where would_recommend = true) as would_recommend_count
      from roadmap_feedback
      where roadmap_id = ${roadmapId}
    `);

    return results[0] || {
      total_feedback: 0,
      avg_score: 0,
      met_expectations_count: 0,
      would_recommend_count: 0,
    };
  }

  async generateAIMatchQuestions(topic: string, category?: string): Promise<{
    questions: Array<{
      id: string;
      question: string;
      type: 'text' | 'select' | 'multiselect';
      options?: string[];
    }>;
    roadmapSuggestion: {
      title: string;
      description: string;
      steps: Array<{ title: string; description: string; duration: string }>;
    };
  }> {
    if (!this.ai) {
      return this.getDefaultMatchQuestions(topic);
    }

    const prompt = `You are an educational roadmap designer. A user wants to create or find a roadmap about "${topic}"${category ? ` in the ${category} category` : ''}.

Return ONLY valid JSON with this exact structure:
{
  "questions": [
    { "id": "q1", "question": "What is your current experience level?", "type": "select", "options": ["Beginner", "Intermediate", "Advanced"] },
    { "id": "q2", "question": "How much time can you commit per week?", "type": "select", "options": ["Less than 5 hours", "5-10 hours", "10-20 hours", "20+ hours"] },
    { "id": "q3", "question": "What specific skills or outcomes do you want?", "type": "text" }
  ],
  "roadmapSuggestion": {
    "title": "Suggested Roadmap Title",
    "description": "A compelling 2-3 sentence description of what this roadmap offers",
    "steps": [
      { "title": "Step 1", "description": "What the user will learn/do", "duration": "Week 1-2" }
    ]
  }
}

Generate 3-5 questions that help understand the user's intent and needs.
Then suggest a roadmap with 4-8 steps tailored to "${topic}".
`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.3 },
      });

      const text = response.text?.trim();
      if (!text) return this.getDefaultMatchQuestions(topic);

      const parsed = JSON.parse(text);
      return {
        questions: parsed.questions || [],
        roadmapSuggestion: parsed.roadmapSuggestion || { title: topic, description: '', steps: [] },
      };
    } catch (e) {
      this.logger.warn('AI question generation failed', e instanceof Error ? e.message : String(e));
      return this.getDefaultMatchQuestions(topic);
    }
  }

  private getDefaultMatchQuestions(topic: string): {
    questions: Array<{ id: string; question: string; type: 'text' | 'select' | 'multiselect'; options?: string[] }>;
    roadmapSuggestion: { title: string; description: string; steps: Array<{ title: string; description: string; duration: string }> };
  } {
    return {
      questions: [
        { id: 'q1', question: 'What is your current experience level?', type: 'select' as const, options: ['Beginner', 'Intermediate', 'Advanced'] },
        { id: 'q2', question: 'How much time can you commit per week?', type: 'select' as const, options: ['Less than 5 hours', '5-10 hours', '10-20 hours', '20+ hours'] },
        { id: 'q3', question: 'What specific skills or outcomes do you want?', type: 'text' as const },
      ],
      roadmapSuggestion: {
        title: `${topic} Roadmap`,
        description: `A structured guide to help you master ${topic}`,
        steps: [
          { title: 'Foundation', description: 'Learn the basics', duration: 'Week 1-2' },
          { title: 'Core Skills', description: 'Build essential skills', duration: 'Week 3-4' },
          { title: 'Advanced Topics', description: 'Deep dive into complex areas', duration: 'Week 5-6' },
          { title: 'Practice & Apply', description: 'Put your knowledge to work', duration: 'Week 7-8' },
        ],
      },
    };
  }

  private async generateIntentTags(dto: CreateRoadmapDto): Promise<{ tags: string[]; summary: string }> {
    if (!this.ai) return { tags: [dto.category], summary: dto.description };

    const prompt = `Analyze this educational roadmap and return ONLY valid JSON:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "summary": "A 2-3 sentence summary of what this roadmap helps users achieve"
}

Roadmap:
Title: ${dto.title}
Description: ${dto.description}
Category: ${dto.category}
Target Audience: ${dto.targetAudience || 'Not specified'}
Prerequisites: ${dto.prerequisites || 'None'}
Outcomes: ${dto.outcomes || 'Not specified'}
Steps: ${dto.steps.map((s) => `- ${s.title}: ${s.description}`).join('\n')}
`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });

      const text = response.text?.trim();
      if (!text) return { tags: [dto.category], summary: dto.description };

      const parsed = JSON.parse(text);
      return {
        tags: parsed.tags || [dto.category],
        summary: parsed.summary || dto.description,
      };
    } catch {
      return { tags: [dto.category], summary: dto.description };
    }
  }

  private async scoreRoadmapIntentMatch(
    roadmapsList: Array<any>,
    intent: any,
  ) {
    if (!this.ai || roadmapsList.length === 0) return roadmapsList;

    const prompt = `Score these roadmaps for how well they match this user's intent.
Return ONLY valid JSON: { "scores": [{"id": "roadmap-id", "score": 0-100, "reason": "one sentence"}] }

User Intent:
Goals: ${JSON.stringify(intent.goals || [])}
Level: ${intent.currentLevel || 'Not specified'}
Category: ${intent.targetCategory || 'Any'}
Time: ${intent.timeCommitment || 'Not specified'}

Roadmaps:
${roadmapsList.map((r) => `- ID: ${r.id}, Title: ${r.title}, Category: ${r.category}, Difficulty: ${r.difficulty}, Tags: ${JSON.stringify(r.aiIntentTags || [])}`).join('\n')}
`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.1 },
      });

      const text = response.text?.trim();
      if (!text) return roadmapsList;

      const parsed = JSON.parse(text);
      const scores = new Map((parsed.scores || []).map((s: any) => [s.id, s]));

      return roadmapsList
        .map((r) => {
          const match = scores.get(r.id) as { score?: number; reason?: string } | undefined;
          return { ...r, matchScore: match?.score || 50, matchReason: match?.reason || '' };
        })
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    } catch {
      return roadmapsList;
    }
  }

  private async updateRoadmapRating(roadmapId: string, score: number) {
    await db
      .update(roadmaps)
      .set({
        ratingAvg: sql`((${roadmaps.ratingAvg} * ${roadmaps.ratingCount}) + ${score}) / (${roadmaps.ratingCount} + 1)`,
        ratingCount: sql`${roadmaps.ratingCount} + 1`,
        satisfactionScore: sql`((${roadmaps.satisfactionScore} * ${roadmaps.ratingCount}) + ${score}) / (${roadmaps.ratingCount} + 1)`,
      })
      .where(eq(roadmaps.id, roadmapId));
  }
}
