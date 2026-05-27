import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AiService } from '../ai';
import {
  CVDataDto,
  CVGoalContextDto,
  CVOpportunityContextDto,
  CVProfileContextDto,
  GenerateCVDraftDto,
  TailorCVDto,
} from './dto/cv-ai.dto';

const CVDataSchema = z.object({
  header: z
    .object({
      full_name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      linkedin: z.string().optional(),
      portfolio: z.string().optional(),
      website: z.string().optional(),
    })
    .optional(),
  summary: z.string().optional(),
  experience: z
    .array(
      z.object({
        id: z.string().optional(),
        company: z.string().optional(),
        role: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        current: z.boolean().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  education: z
    .array(
      z.object({
        id: z.string().optional(),
        institution: z.string().optional(),
        degree: z.string().optional(),
        field: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        gpa: z.number().optional(),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  skills: z.array(z.string()).optional(),
  projects: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
        technologies: z.array(z.string()).optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
      }),
    )
    .optional(),
  achievements: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        date: z.string().optional(),
        issuer: z.string().optional(),
      }),
    )
    .optional(),
});

const DraftResponseSchema = z.object({
  cv: CVDataSchema,
  suggestions: z.array(z.string()).default([]),
});

const TailorResponseSchema = z.object({
  tailored_cv: CVDataSchema,
  match_score: z.number().min(0).max(100),
  improvements: z.array(z.string()).default([]),
  matched_keywords: z.array(z.string()).default([]),
  missing_keywords: z.array(z.string()).default([]),
});

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(private readonly aiService: AiService) {}

  async generateDraft(userId: string, dto: GenerateCVDraftDto) {
    try {
      const parsed = await this.aiService.generateJson({
        feature: 'cv.draft',
        prompt: this.buildDraftPrompt(userId, dto),
        responseMimeType: 'application/json',
        temperature: 0.2,
        metadata: { userId },
      });

      if (parsed) {
        return DraftResponseSchema.parse(parsed);
      }
    } catch (error) {
      this.logger.warn(
        `CV draft generation fell back to heuristic mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const fallbackCv = this.buildFallbackDraft(
      dto.profile,
      dto.goals || [],
      dto.currentCV,
      dto.prompt,
      dto.linkedInUrl,
    );
    return {
      cv: fallbackCv,
      suggestions: [
        'Review the summary and make it more specific to your target opportunity.',
        'Add measurable achievements under experience and projects.',
        'Keep skills aligned to the opportunities you want to apply for.',
      ],
    };
  }

  async tailor(userId: string, dto: TailorCVDto) {
    try {
      const parsed = await this.aiService.generateJson({
        feature: 'cv.tailor',
        prompt: this.buildTailorPrompt(userId, dto),
        responseMimeType: 'application/json',
        temperature: 0.2,
        metadata: { userId, opportunityId: dto.opportunity?.id },
      });

      if (parsed) {
        return TailorResponseSchema.parse(parsed);
      }
    } catch (error) {
      this.logger.warn(
        `CV tailoring fell back to heuristic mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.buildFallbackTailor(dto);
  }

  private buildDraftPrompt(userId: string, dto: GenerateCVDraftDto) {
    return `You are an expert CV/resume writer for students and early-career professionals.

Build a strong, truthful CV draft in JSON only.

Return exactly:
{
  "cv": {
    "header": {
      "full_name": "",
      "email": "",
      "phone": "",
      "location": "",
      "linkedin": "",
      "portfolio": "",
      "website": ""
    },
    "summary": "",
    "experience": [],
    "education": [],
    "skills": [],
    "projects": [],
    "achievements": []
  },
  "suggestions": ["", ""]
}

Rules:
- Do not invent fake employers, schools, dates, or achievements.
- If information is missing, keep fields empty or use concise generic phrasing.
- Optimize the summary and section emphasis toward scholarships, internships, jobs, and academic opportunities.
- Keep skills specific and deduplicated.

User id:
${userId}

Profile:
${JSON.stringify(dto.profile || {}, null, 2)}

Goals:
${JSON.stringify(dto.goals || [], null, 2)}

Current CV:
${JSON.stringify(dto.currentCV || {}, null, 2)}

Prompt:
${dto.prompt || ''}

LinkedIn URL:
${dto.linkedInUrl || ''}`;
  }

  private buildTailorPrompt(userId: string, dto: TailorCVDto) {
    return `You are an expert CV tailoring assistant.

Tailor the CV toward the target opportunity using only truthful reframing and prioritization.

Return exactly:
{
  "tailored_cv": {
    "header": {},
    "summary": "",
    "experience": [],
    "education": [],
    "skills": [],
    "projects": [],
    "achievements": []
  },
  "match_score": 0,
  "improvements": ["", ""],
  "matched_keywords": ["", ""],
  "missing_keywords": ["", ""]
}

Rules:
- Do not fabricate experience.
- Improve summary wording and ordering of relevant details.
- Keep the CV concise and targeted.
- Match score must be 0-100.

User id:
${userId}

Current CV:
${JSON.stringify(dto.currentCV, null, 2)}

Opportunity:
${JSON.stringify(dto.opportunity, null, 2)}

User notes:
${dto.userNotes || ''}`;
  }

  private buildFallbackDraft(
    profile?: CVProfileContextDto,
    goals: CVGoalContextDto[] = [],
    currentCV?: CVDataDto,
    prompt?: string,
    linkedInUrl?: string,
  ): CVDataDto {
    const goalTitles = goals
      .map((goal) => goal.title || goal.description || '')
      .filter(Boolean);
    const mergedSkills = this.unique([
      ...(currentCV?.skills || []),
      ...(profile?.skills || []),
      ...(profile?.interests || []),
    ]);

    const summaryParts = [
      profile?.field_of_study ? `${profile.field_of_study} student` : '',
      profile?.education_level ? `${profile.education_level} level` : '',
      mergedSkills.length
        ? `with strengths in ${mergedSkills.slice(0, 5).join(', ')}`
        : '',
      prompt ? `targeting ${prompt}` : '',
    ].filter(Boolean);

    return {
      header: {
        full_name: currentCV?.header?.full_name || profile?.full_name || '',
        email: currentCV?.header?.email || profile?.email || '',
        phone: currentCV?.header?.phone || '',
        location:
          currentCV?.header?.location ||
          profile?.location ||
          profile?.country ||
          '',
        linkedin: currentCV?.header?.linkedin || linkedInUrl || '',
        portfolio: currentCV?.header?.portfolio || '',
        website: currentCV?.header?.website || '',
      },
      summary:
        currentCV?.summary ||
        (summaryParts.length
          ? `Motivated ${summaryParts.join(' ')}.`
          : 'Motivated student building a strong academic and professional profile.'),
      experience: currentCV?.experience?.length
        ? currentCV.experience
        : goalTitles.slice(0, 2).map((goal, index) => ({
            id: `exp-${index + 1}`,
            company: 'Edutu Experience',
            role: goal || 'Student Project',
            description: `Worked toward ${goal || 'career growth'} with focus on learning, execution, and measurable progress.`,
            highlights: mergedSkills.slice(index * 2, index * 2 + 3),
          })),
      education: currentCV?.education?.length
        ? currentCV.education
        : [
            {
              id: 'edu-1',
              institution: profile?.institution || '',
              degree: profile?.education_level || 'Student',
              field: profile?.field_of_study || '',
            },
          ],
      skills: mergedSkills,
      projects: currentCV?.projects || [],
      achievements: currentCV?.achievements?.length
        ? currentCV.achievements
        : goalTitles.slice(0, 3).map((goal, index) => ({
            id: `ach-${index + 1}`,
            title: goal,
            description: `Pursued ${goal} through structured effort and skill development.`,
          })),
    };
  }

  private buildFallbackTailor(dto: TailorCVDto) {
    const opportunityKeywords = this.unique([
      ...(dto.opportunity.skills || []),
      ...(dto.opportunity.requirements || []),
      ...(dto.opportunity.tags || []),
      dto.opportunity.category,
      dto.opportunity.organization,
      dto.opportunity.title,
    ]);

    const currentSkills = this.unique(dto.currentCV.skills || []);
    const matchedKeywords = currentSkills.filter((skill) =>
      opportunityKeywords.some((keyword) =>
        keyword.toLowerCase().includes(skill.toLowerCase()),
      ),
    );
    const missingKeywords = opportunityKeywords.filter(
      (keyword) =>
        !currentSkills.some((skill) =>
          keyword.toLowerCase().includes(skill.toLowerCase()),
        ),
    );

    const tailoredSummary = [
      `Targeting ${dto.opportunity.title || 'this opportunity'}${dto.opportunity.organization ? ` at ${dto.opportunity.organization}` : ''}.`,
      dto.currentCV.summary || '',
      matchedKeywords.length
        ? `Relevant strengths include ${matchedKeywords.slice(0, 4).join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const matchScore = Math.min(
      100,
      Math.max(
        35,
        Math.round(
          (matchedKeywords.length / Math.max(opportunityKeywords.length, 1)) *
            100,
        ) + 35,
      ),
    );

    return {
      tailored_cv: {
        ...dto.currentCV,
        summary: tailoredSummary.trim(),
        skills: this.unique([
          ...(dto.currentCV.skills || []),
          ...matchedKeywords,
        ]),
      },
      match_score: matchScore,
      improvements: [
        `Tailored the summary toward ${dto.opportunity.title || 'the target role'}.`,
        matchedKeywords.length
          ? `Emphasized matched skills: ${matchedKeywords.slice(0, 4).join(', ')}.`
          : 'Add more directly relevant skills or project keywords.',
        missingKeywords.length
          ? `Review missing areas: ${missingKeywords.slice(0, 5).join(', ')}.`
          : 'Good keyword coverage for this opportunity.',
      ],
      matched_keywords: matchedKeywords,
      missing_keywords: missingKeywords.slice(0, 10),
    };
  }

  private unique(values: Array<string | null | undefined>) {
    return Array.from(
      new Set(
        values.map((value) => String(value || '').trim()).filter(Boolean),
      ),
    );
  }
}
