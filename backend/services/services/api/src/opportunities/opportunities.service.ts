import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { db } from '../db';
import { opportunities } from '../db/schema';
import axios from 'axios';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { eq, or, and } from 'drizzle-orm';
import { z } from 'zod';
import { OpportunityRankingService } from './opportunity-ranking.service';
import {
  OpportunityPreferenceDto,
  OpportunitySignalDto,
  RecommendationQueryDto,
  UserRecommendationRequestDto,
} from './dto/personalization.dto';
import { AiService } from '../ai';
// Note: Apify scraper disabled - using crawl4ai instead
// import {
//     runEdutuScraper,
//     runIntelScraper,
//     checkAllActors,
//     ACTOR_IDS
// } from '../../../../admin/backend/apify-client';

const CHUNKS_TO_FETCH = 10;

const OpportunityDtoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  type: z.string().optional().default('scholarship'),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default('pending'),
  tags: z.array(z.string()).optional(),
});

const ProcessedItemSchema = z.object({
  title: z.string(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  type: z.string().optional().default('scholarship'),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default('pending'),
  tags: z.array(z.string()).optional().default([]),
});

type ProcessedItem = z.infer<typeof ProcessedItemSchema>;

export type CreateOpportunityDto = z.infer<typeof OpportunityDtoSchema>;

export interface AdminOpportunityListQuery {
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
  category?: string;
  sortBy?: string;
}

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);
  private readonly supabase: SupabaseClient | null = null;

  constructor(
    private readonly opportunityRankingService: OpportunityRankingService,
    private readonly aiService: AiService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }

  async findAll(
    limit: number = 20,
    offset: number = 0,
    status?: string,
    category?: string,
  ) {
    const statusFilter = status || 'active';
    const cappedLimit = Math.min(Number(limit) || 20, 100);

    if (category) {
      return db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.status, statusFilter),
            eq(opportunities.category, category),
          ),
        )
        .limit(cappedLimit)
        .offset(Number(offset) || 0)
        .orderBy(opportunities.createdAt)
        .execute();
    }

    return db
      .select()
      .from(opportunities)
      .where(eq(opportunities.status, statusFilter))
      .limit(cappedLimit)
      .offset(Number(offset) || 0)
      .orderBy(opportunities.createdAt)
      .execute();
  }

  async findOne(id: string) {
    const res = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .execute();
    return res[0] ?? null;
  }

  async findAdminList(query: AdminOpportunityListQuery) {
    if (!this.supabase) {
      throw new Error('Supabase is not configured');
    }

    const limit = Math.min(Math.max(Number(query.limit) || 50, 10), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const sortMap: Record<string, { column: string; ascending: boolean }> = {
      newest: { column: 'created_at', ascending: false },
      oldest: { column: 'created_at', ascending: true },
      deadline: { column: 'close_date', ascending: true },
      featured: { column: 'is_featured', ascending: false },
      quality: { column: 'quality_score', ascending: true },
    };
    const sort = sortMap[query.sortBy || 'newest'] ?? sortMap.newest;

    let request = this.supabase
      .from('opportunities')
      .select('*', { count: 'exact' })
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .range(from, to);

    if (query.status && query.status !== 'all') {
      request = request.eq('status', query.status);
    }

    if (query.category && query.category !== 'all') {
      request = request.eq('category', query.category);
    }

    const search = query.search?.trim();
    if (search) {
      const escaped = search.replaceAll('%', '\\%').replaceAll(',', ' ');
      request = request.or(
        `title.ilike.%${escaped}%,organization.ilike.%${escaped}%,category.ilike.%${escaped}%,source.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) {
      throw new Error(error.message);
    }

    return {
      data: data ?? [],
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.max(Math.ceil((count ?? 0) / limit), 1),
      hasMore: to + 1 < (count ?? 0),
    };
  }

  async getAdminStats() {
    if (!this.supabase) {
      throw new Error('Supabase is not configured');
    }

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDays = sevenDaysFromNow.toISOString().slice(0, 10);

    const countRows = await Promise.all([
      this.supabase.from('opportunities').select('id', { count: 'exact', head: true }),
      this.supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      this.supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_featured', true),
      this.supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .or('status.eq.pending_review,metadata->>needs_review.eq.true'),
      this.supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .not('close_date', 'is', null)
        .gte('close_date', new Date().toISOString().slice(0, 10))
        .lte('close_date', sevenDays),
    ]);

    const error = countRows.find((row) => row.error)?.error;
    if (error) {
      throw new Error(error.message);
    }

    return {
      total: countRows[0].count ?? 0,
      active: countRows[1].count ?? 0,
      featured: countRows[2].count ?? 0,
      needsReview: countRows[3].count ?? 0,
      expiringSoon: countRows[4].count ?? 0,
    };
  }

  async create(dto: CreateOpportunityDto) {
    const result = await db
      .insert(opportunities)
      .values({
        title: dto.title,
        description: dto.description,
        category: dto.category,
        type: dto.type || 'scholarship',
        eligibilityCriteria: dto.eligibilityCriteria,
        fundingType: dto.fundingType,
        targetRegion: dto.targetRegion,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        sourceUrl: dto.sourceUrl,
        applyUrl: dto.applyUrl || dto.sourceUrl,
        imageUrl: dto.imageUrl,
        isRemote: dto.isRemote ?? true,
        status: dto.status || 'pending',
        originalJson: JSON.stringify(dto),
      })
      .returning()
      .execute();

    return result[0];
  }

  async update(id: string, data: Partial<CreateOpportunityDto>) {
    const updateData: Partial<typeof opportunities.$inferInsert> = {
      ...data,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      updatedAt: new Date(),
    };

    const result = await db
      .update(opportunities)
      .set(updateData)
      .where(eq(opportunities.id, id))
      .returning()
      .execute();

    return result[0];
  }

  async updateStatus(id: string, status: string) {
    await db
      .update(opportunities)
      .set({ status, updatedAt: new Date() })
      .where(eq(opportunities.id, id))
      .execute();
    return this.findOne(id);
  }

  async remove(id: string) {
    await db.delete(opportunities).where(eq(opportunities.id, id)).execute();
    return { success: true, id };
  }

  async getUserOpportunityPreferences(userId: string) {
    return this.opportunityRankingService.getUserPreferences(userId);
  }

  async updateUserOpportunityPreferences(
    userId: string,
    input: OpportunityPreferenceDto,
  ) {
    return this.opportunityRankingService.upsertUserPreferences(userId, input);
  }

  async recordUserOpportunitySignal(userId: string, input: OpportunitySignalDto) {
    return this.opportunityRankingService.recordSignal(userId, input);
  }

  async getPersonalizedRecommendations(
    userId: string,
    input: UserRecommendationRequestDto,
  ) {
    return this.opportunityRankingService.getRecommendationsForUser(userId, input);
  }

  async queryRecommendations(input: RecommendationQueryDto) {
    return this.opportunityRankingService.queryRecommendations(input);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCronSync() {
    this.logger.log(
      'Starting scheduled Opportunities Sync via Serper API + Gemini',
    );
    await this.syncOpportunities();
  }

  async syncOpportunities() {
    try {
      const aiData = await this.fetchFromSerper();
      if (!aiData || aiData.length === 0) {
        this.logger.warn('No data found from Serper API');
        return;
      }

      const parsedData = await this.extractWithGemini(aiData);

      if (parsedData && parsedData.length > 0) {
        let inserted = 0;
        for (const item of parsedData) {
          try {
            await db
              .insert(opportunities)
              .values({
                title: item.title,
                description: item.description,
                eligibilityCriteria: item.eligibilityCriteria,
                fundingType: item.fundingType,
                targetRegion: item.targetRegion,
                type: 'scholarship',
                sourceUrl: item.sourceUrl,
                applyUrl: item.applyUrl || item.sourceUrl,
                imageUrl: item.imageUrl,
                originalJson: JSON.stringify(item),
                status: 'pending',
              })
              .onConflictDoNothing({ target: opportunities.sourceUrl })
              .execute();
            inserted++;
          } catch (dbErr) {
            this.logger.warn('Failed to insert opportunity: ' + item.sourceUrl);
          }
        }
        this.logger.log(
          'Successfully synced opportunities. Inserted/Ignored: ' + inserted,
        );
        return { success: true, count: inserted };
      }
      return { success: false, reason: 'Failed to extract data' };
    } catch (error) {
      this.logger.error('Error syncing opportunities', error);
      throw error;
    }
  }

  // Main sync method that handles multiple sources
  async syncFromApify(sources?: string) {
    try {
      const sourceList = sources ? sources.split(',') : ['edutu', 'intel'];
      const results: any = { edutu: null, intel: null };
      const allOpportunities: any[] = [];

      this.logger.log('Apify sync disabled - using crawl4ai scraper instead');
      return {
        success: false,
        error: 'Apify sync disabled. Use /api/scraper/run endpoint instead.',
        sources: results,
      };
    } catch (error) {
      this.logger.error('Error in syncFromApify', error);
      return { success: false, error: error.message };
    }
  }

  // Process items with AI to fill missing fields and generate tags
  async processWithAI(items: any[]) {
    const processedItems: ProcessedItem[] = [];

    for (const item of items) {
      try {
        // Skip if already has good data
        if (item.description && item.eligibilityCriteria && item.fundingType) {
          processedItems.push(item as ProcessedItem);
          continue;
        }

        const prompt = `You are a scholarship data enhancement AI. Given the following scholarship data, fill in missing fields and generate relevant tags.

Input Data:
Title: ${item.title}
Description: ${item.description || 'N/A'}
URL: ${item.sourceUrl}
Category: ${item.category}

Please provide:
1. A detailed description (if missing)
2. Eligibility criteria (if missing)
3. Funding type/amount (if missing)
4. Target region/countries (if missing)
5. 3-5 relevant tags (e.g., "STEM", "Women", "Africa", "Graduate", "Full-Ride")
6. Deadline date in ISO format if mentioned (if missing)

Output ONLY a JSON object with these fields:
{
  "description": "detailed description",
  "eligibilityCriteria": "who can apply",
  "fundingType": "amount or type",
  "targetRegion": "target countries/regions",
  "deadline": "YYYY-MM-DD or null",
  "tags": ["tag1", "tag2", "tag3"]
}`;

        const aiData = await this.aiService.generateJson<Record<string, any>>({
          feature: 'opportunities.enhance',
          prompt,
          responseMimeType: 'application/json',
          metadata: { title: item.title, sourceUrl: item.sourceUrl },
        });

        // Merge AI data with original item
        processedItems.push({
          ...item,
          description: item.description || aiData?.description || '',
          eligibilityCriteria:
            item.eligibilityCriteria || aiData?.eligibilityCriteria || '',
          fundingType: item.fundingType || aiData?.fundingType || '',
          targetRegion: item.targetRegion || aiData?.targetRegion || '',
          deadline: item.deadline || aiData?.deadline || null,
          tags: aiData?.tags || [],
        } as ProcessedItem);
      } catch (err) {
        this.logger.warn(
          `AI processing failed for item: ${item.title}`,
          err.message,
        );
        processedItems.push(item as ProcessedItem); // Keep original if AI fails
      }
    }

    return processedItems;
  }

  // Save opportunities to database
  async saveOpportunities(items: any[]) {
    let inserted = 0;
    let skipped = 0;

    const validItems = items.filter((item) => item.title && item.sourceUrl);
    skipped = items.length - validItems.length;

    if (validItems.length === 0) {
      this.logger.log('No valid opportunities to save');
      return { inserted: 0, skipped, opportunities: [] };
    }

    const values = validItems.map((item) => ({
      title: item.title,
      description: item.description || null,
      category: item.category || 'scholarship',
      type: item.type || 'scholarship',
      eligibilityCriteria: item.eligibilityCriteria || null,
      fundingType: item.fundingType || null,
      targetRegion: item.targetRegion || null,
      deadline: item.deadline ? new Date(item.deadline) : null,
      sourceUrl: item.sourceUrl,
      applyUrl: item.applyUrl || item.sourceUrl,
      imageUrl: item.imageUrl || null,
      isRemote: true,
      status: 'pending',
      originalJson: JSON.stringify(item),
    }));

    try {
      const result = await db
        .insert(opportunities)
        .values(values)
        .onConflictDoNothing({ target: opportunities.sourceUrl })
        .returning()
        .execute();

      inserted = result.length;
      skipped += validItems.length - result.length;

      this.logger.log(
        `Saved ${inserted} opportunities, skipped ${skipped} duplicates (batch insert)`,
      );
      return { inserted, skipped, opportunities: result };
    } catch (dbErr) {
      this.logger.error(`Batch insert failed, falling back to sequential`, dbErr.message);
      // Fallback to sequential if batch fails
      const savedOpportunities: any[] = [];
      for (const item of validItems) {
        try {
          const result = await db
            .insert(opportunities)
            .values({
              title: item.title,
              description: item.description || null,
              category: item.category || 'scholarship',
              type: item.type || 'scholarship',
              eligibilityCriteria: item.eligibilityCriteria || null,
              fundingType: item.fundingType || null,
              targetRegion: item.targetRegion || null,
              deadline: item.deadline ? new Date(item.deadline) : null,
              sourceUrl: item.sourceUrl,
              applyUrl: item.applyUrl || item.sourceUrl,
              imageUrl: item.imageUrl || null,
              isRemote: true,
              status: 'pending',
              originalJson: JSON.stringify(item),
            })
            .onConflictDoNothing({ target: opportunities.sourceUrl })
            .returning()
            .execute();

          if (result[0]) {
            inserted++;
            savedOpportunities.push(result[0]);
          } else {
            skipped++;
          }
        } catch (innerErr) {
          this.logger.warn(`Failed to insert: ${item.title}`, innerErr.message);
          skipped++;
        }
      }

      this.logger.log(
        `Saved ${inserted} opportunities, skipped ${skipped} duplicates (sequential fallback)`,
      );
      return { inserted, skipped, opportunities: savedOpportunities };
    }
  }

  async bulkImport(items: any[]) {
    try {
      this.logger.log(
        'Starting bulk import of ' + items.length + ' opportunities',
      );

      // Process with AI first
      const processedItems = await this.processWithAI(items);

      const result = await this.saveOpportunities(processedItems);

      return { success: true, ...result };
    } catch (error) {
      this.logger.error('Error in bulk import', error);
      return { success: false, error: error.message };
    }
  }

  private async fetchFromSerper() {
    const searchQueries = [
      'latest scholarships for african students 2026',
      'fully funded scholarships for international students from africa',
      'master degree scholarships for african youth',
      'undergraduate scholarships abroad for africans',
      'global grants and fellowships for young africans',
      'top international study opportunities for african citizens',
    ];

    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        86400000,
    );
    const query = searchQueries[dayOfYear % searchQueries.length];

    const hourRotation = new Date().getHours();
    const scrapeStart = (hourRotation % 5) * 10;

    this.logger.log(
      'Using Serper search query: ' + query + ' (Offset: ' + scrapeStart + ')',
    );

    const data = JSON.stringify({
      q: query,
      num: CHUNKS_TO_FETCH,
      page: scrapeStart / 10 + 1,
    });

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://google.serper.dev/search',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      data: data,
    };

    const response = await axios.request(config);
    return response.data.organic;
  }

  private async extractWithGemini(searchResults: any[]) {
    const prompt =
      'You are an expert scholarship data extractor. I have obtained the following Google Search results. Extract the opportunities into an array of JSON objects with: title, description, eligibilityCriteria, fundingType, targetRegion, sourceUrl, applyUrl, imageUrl. Output ONLY a valid JSON array. Data: ' +
      JSON.stringify(searchResults);

    try {
      const parsedJson = await this.aiService.generateJson({
        feature: 'opportunities.extract',
        prompt,
        responseMimeType: 'application/json',
        metadata: { resultCount: searchResults.length },
      });

      if (!parsedJson) {
        this.logger.error('Gemini returned empty response');
        return [];
      }

      const GeminiOpportunitySchema = z.object({
        title: z.string(),
        description: z.string().optional().nullable(),
        eligibilityCriteria: z.string().optional().nullable(),
        fundingType: z.string().optional().nullable(),
        targetRegion: z.string().optional().nullable(),
        sourceUrl: z.string().url(),
        applyUrl: z.string().url().optional().nullable(),
        imageUrl: z.string().url().optional().nullable(),
      });

      const GeminiResponseSchema = z.array(GeminiOpportunitySchema);
      const result = GeminiResponseSchema.safeParse(parsedJson);
      if (!result.success) {
        this.logger.error('Gemini extraction failed Zod validation');
        return [];
      }

      return result.data;
    } catch (err) {
      this.logger.error('Gemini extraction failed', err);
      return [];
    }
  }
}
