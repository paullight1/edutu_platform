import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { db } from '../db';
import {
  roadmaps,
  roadmapEnrollments,
  userRoadmapIntents,
  roadmapFeedback,
  profiles,
} from '../db/schema';
import { eq, and, or, ilike, desc, gte, sql } from 'drizzle-orm';
import {
  CreateRoadmapDto,
  UpdateRoadmapDto,
  RoadmapIntentDto,
  RoadmapFeedbackDto,
  AIAssistDto,
  AdoptRoadmapDto,
} from './dto/roadmap.dto';
import { AiService } from '../ai';
import { toDatabaseUserId } from '../common/user-id';

type RoadmapStep = {
  id: string;
  title: string;
  description: string;
  duration?: string;
  resources?: string[];
  relativeDueDays?: number;
  phase?: string;
  taskType?: string;
  calendarSyncEnabled?: boolean;
};

type AdoptedPlanStep = RoadmapStep & {
  id: string;
  sourceStepId?: string;
  order?: number;
  dueAt?: string | null;
  completed?: boolean;
};

@Injectable()
export class RoadmapsService {
  private readonly logger = new Logger(RoadmapsService.name);

  constructor(private readonly aiService: AiService) {}

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

    return items.map((item) => this.serializeRoadmap(item));
  }

  async findOne(id: string) {
    const [item] = await db.select().from(roadmaps).where(eq(roadmaps.id, id));

    if (!item) throw new NotFoundException('Roadmap not found');
    return this.serializeRoadmap(item);
  }

  async findPublishedById(id: string) {
    const [item] = await db
      .select()
      .from(roadmaps)
      .where(and(eq(roadmaps.id, id), eq(roadmaps.status, 'published')));

    if (!item) throw new NotFoundException('Roadmap not found');
    return this.serializeRoadmap(item);
  }

  async findBySlug(slug: string) {
    const [item] = await db
      .select()
      .from(roadmaps)
      .where(and(eq(roadmaps.slug, slug), eq(roadmaps.status, 'published')));

    if (!item) throw new NotFoundException('Roadmap not found');
    return this.serializeRoadmap(item);
  }

  async create(
    dto: CreateRoadmapDto,
    userId: string,
    creatorName = 'Edutu Admin',
    options: { status?: 'draft' | 'published' | 'archived' } = {},
  ) {
    const dbUserId = toDatabaseUserId(userId);
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

    try {
      const aiResult = await this.generateIntentTags(dto);
      aiIntentTags = aiResult.tags;
      aiGeneratedSummary = aiResult.summary;
    } catch (e) {
      this.logger.warn(
        'AI intent generation failed, continuing without it',
        e instanceof Error ? e.message : String(e),
      );
    }

    const [item] = await db
      .insert(roadmaps)
      .values({
        title: dto.title,
        slug:
          dto.slug ||
          `${dto.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 50)}-${crypto.randomUUID().slice(0, 6)}`,
        description: dto.description,
        category: dto.category,
        difficulty: dto.difficulty,
        estimatedDuration: dto.estimatedDuration || null,
        targetAudience: dto.targetAudience || null,
        prerequisites: dto.prerequisites || null,
        outcomes: dto.outcomes || null,
        coverImage: dto.coverImage || null,
        opportunityId: dto.opportunityId || null,
        creatorProof: dto.creatorProof || null,
        deadlineStrategy: dto.deadlineStrategy || null,
        communityId: dto.communityId || null,
        version: dto.version || 1,
        calendarSyncEnabled: dto.calendarSyncEnabled || false,
        status: options.status || 'draft',
        publishedAt: options.status === 'published' ? new Date() : null,
        createdBy: dbUserId,
        creatorName,
        isFeatured: dto.isFeatured,
        steps: steps,
        resources: resources,
        relatedOpportunities: dto.relatedOpportunities,
        aiIntentTags,
        aiGeneratedSummary,
      })
      .returning();

    return this.serializeRoadmap(item);
  }

  async createByCreator(
    dto: CreateRoadmapDto,
    userId: string,
    creatorName = 'Edutu Creator',
  ) {
    const dbUserId = toDatabaseUserId(userId);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, dbUserId));

    const isApprovedCreator = profile?.creatorStatus === 'approved';
    const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator';

    if (!isApprovedCreator && !isAdmin) {
      throw new ForbiddenException(
        'Only approved creators can submit roadmaps.',
      );
    }

    return this.create(
      {
        ...dto,
        isFeatured: false,
      },
      dbUserId,
      creatorName || profile?.fullName || 'Edutu Creator',
      { status: 'published' },
    );
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

    return this.serializeRoadmap(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    await db.delete(roadmaps).where(eq(roadmaps.id, id));
    return { success: true, id };
  }

  async enroll(userId: string, roadmapId: string) {
    await this.findOne(roadmapId);

    const [existing] = await db
      .select()
      .from(roadmapEnrollments)
      .where(
        and(
          eq(roadmapEnrollments.userId, userId),
          eq(roadmapEnrollments.roadmapId, roadmapId),
        ),
      );

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
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!existing) {
      await db
        .update(roadmaps)
        .set({ enrollmentCount: sql`${roadmaps.enrollmentCount} + 1` })
        .where(eq(roadmaps.id, roadmapId));
    }

    return this.serializeEnrollment(enrollment);
  }

  async adopt(userId: string, roadmapId: string, dto: AdoptRoadmapDto) {
    const roadmap = await this.findOne(roadmapId);
    const targetOpportunityId =
      dto.targetOpportunityId ||
      dto.opportunityId ||
      roadmap.opportunityId ||
      null;
    const targetDeadline = this.parseTargetDeadline(dto.targetDeadline);
    const calendarSyncEnabled =
      dto.calendarSyncEnabled ?? roadmap.calendarSyncEnabled ?? false;
    const adoptedPlan = this.buildAdoptedPlan(
      roadmap,
      targetOpportunityId,
      targetDeadline,
      calendarSyncEnabled,
    );

    const [existing] = await db
      .select()
      .from(roadmapEnrollments)
      .where(
        and(
          eq(roadmapEnrollments.userId, userId),
          eq(roadmapEnrollments.roadmapId, roadmapId),
        ),
      );

    const [enrollment] = await db
      .insert(roadmapEnrollments)
      .values({
        userId,
        roadmapId,
        status: 'enrolled',
        progress: existing?.progress || 0,
        currentStep: existing?.currentStep || 0,
        completedSteps: existing?.completedSteps || [],
        targetOpportunityId,
        targetDeadline,
        calendarSyncEnabled,
        adoptedPlan,
        enrolledAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [roadmapEnrollments.userId, roadmapEnrollments.roadmapId],
        set: {
          status: 'enrolled',
          targetOpportunityId,
          targetDeadline,
          calendarSyncEnabled,
          adoptedPlan,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!existing) {
      await db
        .update(roadmaps)
        .set({ enrollmentCount: sql`${roadmaps.enrollmentCount} + 1` })
        .where(eq(roadmaps.id, roadmapId));
    }

    return this.serializeEnrollment(enrollment, roadmap);
  }

  async getUserEnrollments(userId: string) {
    const rows = await db
      .select({
        enrollment: roadmapEnrollments,
        roadmap: roadmaps,
      })
      .from(roadmapEnrollments)
      .innerJoin(roadmaps, eq(roadmapEnrollments.roadmapId, roadmaps.id))
      .where(eq(roadmapEnrollments.userId, userId))
      .orderBy(desc(roadmapEnrollments.enrolledAt));

    return rows.map((row) => ({
      enrollment: this.serializeEnrollment(row.enrollment, row.roadmap),
      roadmap: this.serializeRoadmap(row.roadmap),
    }));
  }

  async getEnrollmentCalendar(userId: string, enrollmentId: string) {
    const [row] = await db
      .select({
        enrollment: roadmapEnrollments,
        roadmap: roadmaps,
      })
      .from(roadmapEnrollments)
      .innerJoin(roadmaps, eq(roadmapEnrollments.roadmapId, roadmaps.id))
      .where(
        and(
          eq(roadmapEnrollments.id, enrollmentId),
          eq(roadmapEnrollments.userId, userId),
        ),
      );

    if (!row) throw new NotFoundException('Enrollment not found');

    const calendar = this.buildCalendarExport(row.enrollment, row.roadmap);
    return {
      enrollmentId: row.enrollment.id,
      roadmapId: row.roadmap.id,
      filename: calendar.filename,
      contentType: 'text/calendar',
      events: calendar.events,
      ics: calendar.ics,
    };
  }

  async updateProgress(
    userId: string,
    roadmapId: string,
    stepId: string,
    completed: boolean,
  ) {
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

    const progress =
      steps.length > 0
        ? Math.round((completedSteps.length / steps.length) * 100)
        : 0;

    const [updated] = await db
      .update(roadmapEnrollments)
      .set({
        progress,
        currentStep: stepIndex,
        completedSteps,
        completedAt: progress === 100 ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(roadmapEnrollments.id, enrollment.id))
      .returning();

    return this.serializeEnrollment(updated);
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

    if (intent) {
      try {
        const scored = await this.scoreRoadmapIntentMatch(items, intent);
        return scored
          .slice(0, cappedLimit)
          .map((item) => this.serializeRoadmap(item));
      } catch (e) {
        this.logger.warn('AI scoring failed, returning unsorted results');
      }
    }

    return items.map((item) => this.serializeRoadmap(item));
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

    return (
      result[0] || {
        total_roadmaps: 0,
        published_roadmaps: 0,
        draft_roadmaps: 0,
        total_enrollments: 0,
        avg_satisfaction: 0,
      }
    );
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

    return (
      results[0] || {
        total_feedback: 0,
        avg_score: 0,
        met_expectations_count: 0,
        would_recommend_count: 0,
      }
    );
  }

  async generateAIMatchQuestions(
    topic: string,
    category?: string,
  ): Promise<{
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
      const parsed = await this.aiService.generateJson<any>({
        feature: 'roadmaps.questions',
        prompt,
        responseMimeType: 'application/json',
        temperature: 0.3,
        metadata: { topic, category },
      });

      if (!parsed) return this.getDefaultMatchQuestions(topic);

      return {
        questions: parsed.questions || [],
        roadmapSuggestion: parsed.roadmapSuggestion || {
          title: topic,
          description: '',
          steps: [],
        },
      };
    } catch (e) {
      this.logger.warn(
        'AI question generation failed',
        e instanceof Error ? e.message : String(e),
      );
      return this.getDefaultMatchQuestions(topic);
    }
  }

  private getDefaultMatchQuestions(topic: string): {
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
  } {
    return {
      questions: [
        {
          id: 'q1',
          question: 'What is your current experience level?',
          type: 'select' as const,
          options: ['Beginner', 'Intermediate', 'Advanced'],
        },
        {
          id: 'q2',
          question: 'How much time can you commit per week?',
          type: 'select' as const,
          options: [
            'Less than 5 hours',
            '5-10 hours',
            '10-20 hours',
            '20+ hours',
          ],
        },
        {
          id: 'q3',
          question: 'What specific skills or outcomes do you want?',
          type: 'text' as const,
        },
      ],
      roadmapSuggestion: {
        title: `${topic} Roadmap`,
        description: `A structured guide to help you master ${topic}`,
        steps: [
          {
            title: 'Foundation',
            description: 'Learn the basics',
            duration: 'Week 1-2',
          },
          {
            title: 'Core Skills',
            description: 'Build essential skills',
            duration: 'Week 3-4',
          },
          {
            title: 'Advanced Topics',
            description: 'Deep dive into complex areas',
            duration: 'Week 5-6',
          },
          {
            title: 'Practice & Apply',
            description: 'Put your knowledge to work',
            duration: 'Week 7-8',
          },
        ],
      },
    };
  }

  private async generateIntentTags(
    dto: CreateRoadmapDto,
  ): Promise<{ tags: string[]; summary: string }> {
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
      const parsed = await this.aiService.generateJson<any>({
        feature: 'roadmaps.intent_tags',
        prompt,
        responseMimeType: 'application/json',
        temperature: 0.2,
        metadata: { title: dto.title, category: dto.category },
      });

      if (!parsed) return { tags: [dto.category], summary: dto.description };

      return {
        tags: parsed.tags || [dto.category],
        summary: parsed.summary || dto.description,
      };
    } catch {
      return { tags: [dto.category], summary: dto.description };
    }
  }

  private async scoreRoadmapIntentMatch(roadmapsList: Array<any>, intent: any) {
    if (roadmapsList.length === 0) return roadmapsList;

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
      const parsed = await this.aiService.generateJson<any>({
        feature: 'roadmaps.match',
        prompt,
        responseMimeType: 'application/json',
        temperature: 0.1,
        metadata: { roadmapCount: roadmapsList.length },
      });

      if (!parsed) return roadmapsList;

      const scores = new Map((parsed.scores || []).map((s: any) => [s.id, s]));

      return roadmapsList
        .map((r) => {
          const match = scores.get(r.id) as
            | { score?: number; reason?: string }
            | undefined;
          return {
            ...r,
            matchScore: match?.score || 50,
            matchReason: match?.reason || '',
          };
        })
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    } catch {
      return roadmapsList;
    }
  }

  private parseTargetDeadline(targetDeadline?: string): Date | null {
    if (!targetDeadline) return null;

    const parsed = new Date(targetDeadline);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('targetDeadline must be a valid date');
    }

    return parsed;
  }

  private buildAdoptedPlan(
    roadmap: any,
    targetOpportunityId: string | null,
    targetDeadline: Date | null,
    calendarSyncEnabled: boolean,
  ) {
    const steps = ((roadmap.steps || []) as RoadmapStep[]).map(
      (step, index) => {
        const dueAt = this.resolveStepDueAt(
          step.relativeDueDays,
          targetDeadline,
        );

        return {
          id: crypto.randomUUID(),
          sourceStepId: step.id,
          order: index,
          title: step.title,
          description: step.description,
          duration: step.duration,
          resources: step.resources || [],
          phase: step.phase || null,
          taskType: step.taskType || null,
          relativeDueDays: step.relativeDueDays ?? null,
          dueAt: dueAt ? dueAt.toISOString() : null,
          calendarSyncEnabled: step.calendarSyncEnabled ?? calendarSyncEnabled,
          completed: false,
        };
      },
    );

    return {
      roadmapId: roadmap.id,
      targetOpportunityId,
      generatedAt: new Date().toISOString(),
      deadlineStrategy: roadmap.deadlineStrategy || null,
      targetDeadline: targetDeadline ? targetDeadline.toISOString() : null,
      calendarSyncEnabled,
      steps,
    };
  }

  private resolveStepDueAt(
    relativeDueDays?: number,
    targetDeadline?: Date | null,
  ): Date | null {
    if (relativeDueDays === undefined || relativeDueDays === null) return null;
    if (!targetDeadline && relativeDueDays < 0) return null;

    const base = targetDeadline ? new Date(targetDeadline) : new Date();
    base.setDate(base.getDate() + relativeDueDays);
    return base;
  }

  private serializeRoadmap(roadmap: any) {
    if (!roadmap) return roadmap;

    return {
      ...roadmap,
      estimated_duration: roadmap.estimatedDuration,
      target_audience: roadmap.targetAudience,
      cover_image: roadmap.coverImage,
      opportunity_id: roadmap.opportunityId,
      creator_proof: roadmap.creatorProof,
      deadline_strategy: roadmap.deadlineStrategy,
      community_id: roadmap.communityId,
      calendar_sync_enabled: roadmap.calendarSyncEnabled,
      created_by: roadmap.createdBy,
      creator_name: roadmap.creatorName,
      is_featured: roadmap.isFeatured,
      enrollment_count: roadmap.enrollmentCount,
      rating_avg: roadmap.ratingAvg,
      rating_count: roadmap.ratingCount,
      related_opportunities: roadmap.relatedOpportunities,
      ai_intent_tags: roadmap.aiIntentTags,
      ai_generated_summary: roadmap.aiGeneratedSummary,
      satisfaction_score: roadmap.satisfactionScore,
      created_at: roadmap.createdAt,
      updated_at: roadmap.updatedAt,
      published_at: roadmap.publishedAt,
    };
  }

  private buildReminderSchedule(enrollment: any, roadmap?: any) {
    const adoptedPlan = enrollment.adoptedPlan || {};
    const steps = ((adoptedPlan.steps || []) as AdoptedPlanStep[])
      .filter((step) => step.dueAt)
      .map((step) => ({
        id: `roadmap-step-${step.id}`,
        type: 'roadmap_step_due',
        title: step.title,
        body: `Roadmap step due: ${step.title}`,
        scheduledFor: step.dueAt,
        roadmapId: enrollment.roadmapId,
        enrollmentId: enrollment.id,
        stepId: step.id,
      }));

    const targetDeadline =
      enrollment.targetDeadline || adoptedPlan.targetDeadline;
    const deadlineReminders = targetDeadline
      ? [30, 14, 7, 3, 1]
          .map((daysBefore) => {
            const scheduledFor = new Date(targetDeadline);
            scheduledFor.setDate(scheduledFor.getDate() - daysBefore);
            return {
              id: `roadmap-deadline-${enrollment.id}-${daysBefore}`,
              type: 'opportunity_deadline',
              title: `${daysBefore} day${daysBefore === 1 ? '' : 's'} until deadline`,
              body: `${roadmap?.title || 'Your roadmap'} target deadline is approaching.`,
              scheduledFor: scheduledFor.toISOString(),
              roadmapId: enrollment.roadmapId,
              enrollmentId: enrollment.id,
              daysBefore,
            };
          })
          .filter((item) => new Date(item.scheduledFor).getTime() > Date.now())
      : [];

    return [...steps, ...deadlineReminders].sort(
      (a, b) =>
        new Date(a.scheduledFor || 0).getTime() -
        new Date(b.scheduledFor || 0).getTime(),
    );
  }

  private buildCommunityAction(roadmap?: any) {
    if (!roadmap?.communityId) return null;

    return {
      type: 'join_community',
      communityId: roadmap.communityId,
      label: 'Join roadmap community',
      route: `/app/community?communityId=${encodeURIComponent(roadmap.communityId)}`,
      message:
        'Continue with learners following this roadmap and ask for peer support.',
    };
  }

  private buildCalendarExport(enrollment: any, roadmap?: any) {
    const adoptedPlan = enrollment.adoptedPlan || {};
    const steps = ((adoptedPlan.steps || []) as AdoptedPlanStep[]).filter(
      (step) => step.dueAt,
    );
    const targetDeadline =
      enrollment.targetDeadline || adoptedPlan.targetDeadline;
    const events = [
      ...steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description || '',
        startsAt: step.dueAt ?? null,
        type: 'roadmap_step',
      })),
      ...(targetDeadline
        ? [
            {
              id: `deadline-${enrollment.id}`,
              title: `${roadmap?.title || 'Roadmap'} target deadline`,
              description:
                adoptedPlan.deadlineStrategy || roadmap?.deadlineStrategy || '',
              startsAt: new Date(targetDeadline).toISOString(),
              type: 'target_deadline',
            },
          ]
        : []),
    ].filter((event) => event.startsAt);

    const filename = `${this.slugify(roadmap?.title || 'edutu-roadmap')}-${enrollment.id}.ics`;
    const ics = this.buildIcs(filename, events);

    return { filename, events, ics };
  }

  private buildIcs(
    calendarName: string,
    events: Array<{
      id: string;
      title: string;
      description?: string;
      startsAt: string | null;
      type: string;
    }>,
  ) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Edutu//Roadmap Calendar//EN',
      `X-WR-CALNAME:${this.escapeIcs(calendarName.replace(/\.ics$/i, ''))}`,
    ];

    for (const event of events) {
      if (!event.startsAt) continue;
      const startsAt = new Date(event.startsAt);
      if (Number.isNaN(startsAt.getTime())) continue;
      const endsAt = new Date(startsAt);
      endsAt.setHours(endsAt.getHours() + 1);

      lines.push(
        'BEGIN:VEVENT',
        `UID:${this.escapeIcs(`${event.id}@edutu-roadmaps`)}`,
        `DTSTAMP:${this.toIcsDate(new Date())}`,
        `DTSTART:${this.toIcsDate(startsAt)}`,
        `DTEND:${this.toIcsDate(endsAt)}`,
        `SUMMARY:${this.escapeIcs(event.title)}`,
        `DESCRIPTION:${this.escapeIcs(event.description || event.type)}`,
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  private toIcsDate(date: Date) {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }

  private escapeIcs(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  private slugify(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'edutu-roadmap'
    );
  }

  private serializeEnrollment(enrollment: any, roadmap?: any) {
    if (!enrollment) return enrollment;
    const calendar = this.buildCalendarExport(enrollment, roadmap);
    const reminderSchedule = this.buildReminderSchedule(enrollment, roadmap);
    const communityAction = this.buildCommunityAction(roadmap);

    return {
      ...enrollment,
      user_id: enrollment.userId,
      roadmap_id: enrollment.roadmapId,
      current_step: enrollment.currentStep,
      completed_steps: enrollment.completedSteps,
      target_opportunity_id: enrollment.targetOpportunityId,
      target_deadline: enrollment.targetDeadline,
      calendar_sync_enabled: enrollment.calendarSyncEnabled,
      adopted_plan: enrollment.adoptedPlan,
      enrolled_at: enrollment.enrolledAt,
      completed_at: enrollment.completedAt,
      updated_at: enrollment.updatedAt,
      calendar: {
        enabled: Boolean(enrollment.calendarSyncEnabled),
        eventCount: calendar.events.length,
        filename: calendar.filename,
        exportUrl: `/roadmaps/enrollments/${enrollment.id}/calendar`,
      },
      reminderSchedule,
      reminder_schedule: reminderSchedule,
      communityAction,
      community_action: communityAction,
    };
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
