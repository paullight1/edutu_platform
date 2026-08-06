export interface StoryChapter {
    heading: string;
    body: string[];
}

export interface StoryStat {
    value: string;
    label: string;
}

export type ImpactStoryStatus = 'draft' | 'published';

/**
 * A beneficiary story on the public /edutuforyou page.
 *
 * `isComposite` marks a story as an illustrative composite rather than a real,
 * consented user. The public page renders a disclosure line for any story with
 * it set. Clear it only when the story describes a real person who has agreed
 * to have it published — an invented story published without it is a
 * fabricated testimonial.
 */
export interface ImpactStory {
    id: string;
    slug: string;
    name: string;
    age: number | null;
    place: string;
    outcome: string;
    portrait: string;
    portraitAlt: string;
    heroImage: string;
    heroAlt: string;
    quote: string;
    teaser: string;
    chapters: StoryChapter[];
    stats: StoryStat[];
    barrier: string | null;
    isComposite: boolean;
    status: ImpactStoryStatus;
    sortOrder: number;
    createdAt?: string;
    updatedAt?: string;
}

export type ImpactStoryDraft = Omit<
    ImpactStory,
    'id' | 'createdAt' | 'updatedAt'
>;

export const EMPTY_STORY: ImpactStoryDraft = {
    slug: '',
    name: '',
    age: null,
    place: '',
    outcome: '',
    portrait: '',
    portraitAlt: '',
    heroImage: '',
    heroAlt: '',
    quote: '',
    teaser: '',
    chapters: [{ heading: '', body: [''] }],
    stats: [],
    barrier: '',
    // Safe default: a new story is assumed invented until someone says otherwise.
    isComposite: true,
    status: 'draft',
    sortOrder: 0,
};
