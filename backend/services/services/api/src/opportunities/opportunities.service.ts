import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { db } from '../db';
import { opportunities } from '../db/schema';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { eq, or, and } from 'drizzle-orm';
import { z } from 'zod';
import { OpportunityRankingService } from './opportunity-ranking.service';
import {
  OpportunityPreferenceDto,
  OpportunitySignalDto,
  RecommendationQueryDto,
  UserRecommendationRequestDto,
} from './dto/personalization.dto';
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

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);
  private readonly ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  constructor(
    private readonly opportunityRankingService: OpportunityRankingService,
  ) {}

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
    if (!process.env.GEMINI_API_KEY) {
      this.logger.warn('GEMINI_API_KEY not set, skipping AI processing');
      return items;
    }

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

        const response = await this.ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        const aiData = response.text ? JSON.parse(response.text) : {};

        // Merge AI data with original item
        processedItems.push({
          ...item,
          description: item.description || aiData.description || '',
          eligibilityCriteria:
            item.eligibilityCriteria || aiData.eligibilityCriteria || '',
          fundingType: item.fundingType || aiData.fundingType || '',
          targetRegion: item.targetRegion || aiData.targetRegion || '',
          deadline: item.deadline || aiData.deadline || null,
          tags: aiData.tags || [],
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
      const response = await this.ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const textOutput = response.text;
      if (!textOutput) {
        this.logger.error('Gemini returned empty response');
        return [];
      }
      const parsedJson = JSON.parse(textOutput);

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
