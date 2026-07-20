import { requestProductApi, type GetAuthToken } from './productApi';
import type { Opportunity } from '../types/opportunity';

// ---------------------------------------------------------------------------
// Types (mirror backend src/copilot/dto/copilot.dto.ts)
// ---------------------------------------------------------------------------

export type ChecklistCategory = 'documents' | 'eligibility' | 'preparation' | 'submission';

export interface KitChecklistItem {
  id: string;
  label: string;
  detail?: string;
  category: ChecklistCategory;
}

export interface KitEssayPrompt {
  id: string;
  prompt: string;
  guidance?: string;
  suggestedAngle?: string;
}

export interface KitEligibilityFlag {
  flag: string;
  severity: 'blocker' | 'warning';
}

export interface KitContent {
  fitNote: string;
  strategy: string[];
  checklist: KitChecklistItem[];
  essayPrompts: KitEssayPrompt[];
  /** Real eligibility conflicts for this applicant (honest fit). */
  eligibilityFlags: KitEligibilityFlag[];
  /** The biggest competitive gaps to close. */
  gaps: string[];
}

export interface EssayOutline {
  thesis: string;
  hook?: string;
  sections: Array<{ heading: string; points: string[] }>;
  closing?: string;
  avoid: string[];
}

export interface EssayFeedback {
  overallScore: number;
  scores: { clarity: number; relevance: number; impact: number; authenticity: number };
  verdict: string;
  strengths: string[];
  improvements: string[];
  lineEdits: Array<{ original: string; suggestion: string; reason?: string }>;
  revisedOpening?: string;
}

export interface EssayWorkspaceEntry {
  promptId: string;
  prompt: string;
  outline?: EssayOutline;
  draft?: string;
  feedback?: EssayFeedback;
  updatedAt: string;
}

export interface ApplicationKit {
  id?: string;
  opportunityId: string;
  kit: KitContent;
  essays: EssayWorkspaceEntry[];
  checklistState: Record<string, boolean>;
  generatedBy: 'ai' | 'fallback' | 'local';
  /**
   * False when the server generated the kit against an empty profile — the
   * client shows a "complete your profile for a sharper kit" nudge instead of
   * pretending the kit is personalized. Absent on cached/local kits.
   */
  profileGrounded?: boolean;
  createdAt?: string;
  updatedAt?: string;
  opportunity?: {
    id: string;
    title: string | null;
    deadline: string | null;
    organization: string | null;
    imageUrl: string | null;
    category: string | null;
    applyUrl?: string | null;
  };
}

export type CopilotSource = 'ai' | 'local';

// ---------------------------------------------------------------------------
// Backend calls (with local fallbacks so the co-pilot still works offline —
// same convention as services/cv.ts: result carries a `source` discriminator)
// ---------------------------------------------------------------------------

export async function fetchApplicationKits(
  getAuthToken: GetAuthToken,
): Promise<ApplicationKit[]> {
  const result = await requestProductApi<ApplicationKit[]>(
    '/copilot/kits',
    { method: 'GET' },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export async function fetchApplicationKit(
  opportunityId: string,
  getAuthToken: GetAuthToken,
): Promise<ApplicationKit | null> {
  return requestProductApi<ApplicationKit>(
    `/copilot/kits/${opportunityId}`,
    { method: 'GET' },
    getAuthToken,
  );
}

export async function generateApplicationKit(
  opportunity: Opportunity,
  getAuthToken: GetAuthToken,
  options: { refresh?: boolean } = {},
): Promise<{ kit: ApplicationKit; source: CopilotSource }> {
  const response = await requestProductApi<ApplicationKit>(
    `/copilot/kits/${opportunity.id}/generate`,
    { method: 'POST', body: JSON.stringify({ refresh: options.refresh ?? false }) },
    getAuthToken,
    // Kit generation runs several LLM sections; the 12s default aborts it while
    // the server keeps going, charges, and persists — showing the user a local
    // template they think they paid for. Give it a real budget.
    60000,
  );
  if (response?.kit) {
    return { kit: normalizeKit(response), source: 'ai' };
  }
  // The POST may have aborted client-side while the server finished and saved
  // the real kit. Poll the GET before falling back to a local template.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const recovered = await fetchApplicationKit(opportunity.id, getAuthToken);
    if (recovered?.kit && Object.keys(recovered.kit).length > 0) {
      return { kit: normalizeKit(recovered), source: 'ai' };
    }
  }
  return { kit: buildLocalKit(opportunity), source: 'local' };
}

export async function generateEssayOutline(
  opportunityId: string,
  params: { promptId: string; prompt?: string; angle?: string },
  getAuthToken: GetAuthToken,
): Promise<{ outline: EssayOutline; source: CopilotSource }> {
  const response = await requestProductApi<{ outline: EssayOutline; source: string }>(
    `/copilot/kits/${opportunityId}/outline`,
    { method: 'POST', body: JSON.stringify(params) },
    getAuthToken,
    60000,
  );
  if (response?.outline) {
    return { outline: response.outline, source: 'ai' };
  }
  return { outline: buildLocalOutline(params.prompt || ''), source: 'local' };
}

export async function requestEssayFeedback(
  opportunityId: string,
  params: { promptId: string; prompt?: string; draft: string },
  getAuthToken: GetAuthToken,
): Promise<{ feedback: EssayFeedback; source: CopilotSource }> {
  const response = await requestProductApi<{ feedback: EssayFeedback; source: string }>(
    `/copilot/kits/${opportunityId}/feedback`,
    { method: 'POST', body: JSON.stringify(params) },
    getAuthToken,
    60000,
  );
  if (response?.feedback) {
    return { feedback: response.feedback, source: 'ai' };
  }
  return { feedback: buildLocalFeedback(params.draft), source: 'local' };
}

export async function saveEssayDraft(
  opportunityId: string,
  params: { promptId: string; prompt?: string; draft: string },
  getAuthToken: GetAuthToken,
): Promise<boolean> {
  const result = await requestProductApi<{ success?: boolean }>(
    `/copilot/kits/${opportunityId}/essay`,
    { method: 'PATCH', body: JSON.stringify(params) },
    getAuthToken,
  );
  return Boolean(result?.success);
}

export async function updateKitChecklist(
  opportunityId: string,
  params: { itemId: string; done: boolean },
  getAuthToken: GetAuthToken,
): Promise<boolean> {
  const result = await requestProductApi<{ success?: boolean }>(
    `/copilot/kits/${opportunityId}/checklist`,
    { method: 'PATCH', body: JSON.stringify(params) },
    getAuthToken,
  );
  return Boolean(result?.success);
}

// ---------------------------------------------------------------------------
// Referee outreach email (generated locally — there is no matching backend
// endpoint shape for this, and a well-interpolated template beats a round-trip)
// ---------------------------------------------------------------------------

export interface RefereeEmailInput {
  userName?: string | null;
  /** e.g. program of study or field, when known */
  program?: string | null;
  opportunityTitle: string;
  organization?: string | null;
  deadline?: string | null;
}

/** A ready-to-send referee/recommendation request email. */
export function buildRefereeRequestEmail(input: RefereeEmailInput): string {
  const name = (input.userName || '').trim() || 'Your name';
  const title = input.opportunityTitle.trim();
  const org = (input.organization || '').trim();
  const programLine = (input.program || '').trim();

  let deadlineLine = 'The application deadline is coming up soon';
  let refereeDeadlineNote =
    'to give you plenty of time, it would be a huge help to have the letter about two weeks before then.';
  if (input.deadline) {
    const date = new Date(input.deadline);
    if (!Number.isNaN(date.getTime())) {
      const formatted = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      deadlineLine = `The application deadline is ${formatted}`;
      const lead = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000);
      refereeDeadlineNote = `to stay safely ahead of it, it would be a huge help to have the letter by ${lead.toLocaleDateString(
        'en-US',
        { month: 'long', day: 'numeric' },
      )} (about two weeks before).`;
    }
  }

  return [
    `Subject: Recommendation request — ${title}`,
    '',
    'Dear [Referee name],',
    '',
    `I hope you're doing well. I'm applying to ${title}${org ? ` (run by ${org})` : ''} and it would mean a great deal to have your support — your perspective on my work is one I value most.`,
    '',
    `${deadlineLine}, and ${refereeDeadlineNote}`,
    '',
    'To make it as easy as possible, I can send over:',
    '- A short summary of the opportunity and what the reviewers look for',
    `- My current CV${programLine ? ` and a note on my work in ${programLine}` : ''}`,
    '- The 2-3 specific projects or moments I hope you might speak to',
    '',
    'Please let me know if you are able to write the letter — and if the timing is tight, I completely understand.',
    '',
    'Thank you so much for considering it.',
    '',
    'Warm regards,',
    name,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Local fallbacks
// ---------------------------------------------------------------------------

function normalizeKit(kit: ApplicationKit): ApplicationKit {
  return {
    ...kit,
    kit: {
      fitNote: kit.kit?.fitNote || '',
      strategy: kit.kit?.strategy || [],
      checklist: kit.kit?.checklist || [],
      essayPrompts: kit.kit?.essayPrompts || [],
      eligibilityFlags: Array.isArray(kit.kit?.eligibilityFlags) ? kit.kit.eligibilityFlags : [],
      gaps: Array.isArray(kit.kit?.gaps) ? kit.kit.gaps : [],
    },
    essays: Array.isArray(kit.essays) ? kit.essays : [],
    checklistState: kit.checklistState || {},
    generatedBy: kit.generatedBy === 'fallback' ? 'fallback' : 'ai',
  };
}

export function buildLocalKit(opportunity: Opportunity): ApplicationKit {
  const requirements = (opportunity.requirements || []).slice(0, 5);
  const checklist: KitChecklistItem[] = [
    ...requirements.map((requirement, index) => ({
      id: `req-${index}`,
      label: requirement,
      category: 'eligibility' as const,
    })),
    {
      id: 'cv',
      label: 'Update your CV for this opportunity',
      detail: 'Use the CV builder’s tailor tool to align it with what this program values.',
      category: 'documents',
    },
    { id: 'transcripts', label: 'Academic transcripts or proof of study', category: 'documents' },
    {
      id: 'referees',
      label: 'Request recommendation letters early',
      detail: 'Give referees at least two weeks and share the opportunity summary with them.',
      category: 'preparation',
    },
    { id: 'essays', label: 'Draft your personal statement / essays', category: 'preparation' },
    {
      id: 'submit',
      label: 'Review everything, then submit before the deadline',
      detail: 'Aim to submit at least 48 hours early.',
      category: 'submission',
    },
  ];

  return {
    opportunityId: opportunity.id,
    kit: {
      fitNote:
        'Lead with the strongest, most specific story from your background — reviewers reward evidence over adjectives.',
      strategy: [
        'Mirror the opportunity’s own language: repeat the exact skills and values named in its description.',
        'Quantify at least two achievements — numbers make reviewers stop skimming.',
        'Answer the question actually asked, not the essay you wish you could write.',
      ],
      checklist,
      essayPrompts: [
        {
          id: 'why-you',
          prompt: `Why are you a strong candidate for ${opportunity.title}?`,
          guidance:
            'Reviewers want a specific, evidenced case — one clear theme backed by 2-3 concrete achievements.',
        },
        {
          id: 'impact-goal',
          prompt:
            'Describe a challenge you have overcome and what it taught you about the impact you want to make.',
          guidance:
            'Show change over time: situation, what you did, and how it shapes your goals.',
        },
      ],
      eligibilityFlags: [],
      gaps: [],
    },
    essays: [],
    checklistState: {},
    generatedBy: 'local',
    opportunity: {
      id: opportunity.id,
      title: opportunity.title,
      deadline: opportunity.deadline ?? null,
      organization: opportunity.organization ?? null,
      imageUrl: opportunity.image ?? null,
      category: opportunity.category ?? null,
      applyUrl: opportunity.applyUrl ?? null,
    },
  };
}

function buildLocalOutline(promptText: string): EssayOutline {
  return {
    thesis:
      'One clear theme — the specific strength that makes you the obvious pick — proven with concrete evidence.',
    hook: 'Open inside a specific moment (a scene, a result, a decision), not with a definition or a quote.',
    sections: [
      {
        heading: 'The hook: a concrete moment',
        points: ['Drop the reader into a specific scene that embodies your theme'],
      },
      {
        heading: 'Your evidence',
        points: ['Your 2-3 strongest achievements related to the prompt', 'Quantify: numbers, scale, outcomes'],
      },
      {
        heading: 'Growth and self-awareness',
        points: ['What was hard, what you learned, what you’d do differently'],
      },
      {
        heading: 'Why this opportunity, why now',
        points: ['Name specifics about the program', 'Show the line from this program to your next goal'],
      },
      {
        heading: 'Close the loop',
        points: ['Return to your opening moment with new meaning', 'End on future impact, not gratitude'],
      },
    ],
    closing: 'Circle back to your hook and point it at the future.',
    avoid: [
      'Opening with a dictionary definition or famous quote',
      'Listing achievements without a connecting theme',
      promptText ? `Ignoring part of the prompt: "${promptText.slice(0, 100)}"` : 'Ignoring part of the prompt',
    ],
  };
}

function buildLocalFeedback(draft: string): EssayFeedback {
  const words = draft.trim().split(/\s+/).filter(Boolean);
  const paragraphs = draft.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const hasNumbers = /\d/.test(draft);

  const improvements: string[] = [];
  if (words.length < 150) {
    improvements.push('The draft is short — most statements need 300-600 words to build a real case.');
  }
  if (paragraphs.length < 3) {
    improvements.push('Break the draft into clear paragraphs: hook, evidence, growth, why-this-program, close.');
  }
  if (!hasNumbers) {
    improvements.push('Add at least two concrete numbers — evidence beats adjectives.');
  }
  if (!improvements.length) {
    improvements.push('Tighten every sentence: cut filler words and make each paragraph earn its place.');
  }

  const clarity = Math.min(10, Math.max(3, paragraphs.length * 2 + 2));
  const impact = hasNumbers ? 7 : 4;

  return {
    overallScore: Math.min(85, Math.max(30, (clarity + impact + 13) * 3)),
    scores: { clarity, relevance: 6, impact, authenticity: 6 },
    verdict:
      'Offline review: structural feedback only — reconnect for the full AI critique.',
    strengths: [words.length >= 150 ? 'Substantial draft — you have material to shape.' : 'You’ve started — the hardest part is behind you.'],
    improvements,
    lineEdits: [],
  };
}
