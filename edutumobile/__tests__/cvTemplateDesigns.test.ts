import { buildCVHtml } from '@edutu/core/src/services/cv';
import {
    DEFAULT_TEMPLATE_DESIGN,
    TEMPLATE_DESIGNS,
    resolveTemplateDesign,
    resolveTemplateDesignById,
} from '@edutu/core/src/services/templateDesigns';
import type { UserCV } from '@edutu/core/src/types/cv';

/**
 * The regression these tests exist for: `buildCVHtml` used to ignore
 * `template_id` entirely, so all templates exported an identical document
 * while the gallery advertised different colours.
 */

const SAMPLE: Partial<UserCV> = {
    name: 'My CV',
    data_json: {
        header: {
            full_name: 'Amina Okafor',
            email: 'amina@example.com',
            phone: '+234 801 234 5678',
            location: 'Lagos, Nigeria',
        },
        summary: 'Product analyst with three years in fintech.',
        skills: ['SQL', 'Python', 'Stakeholder management'],
        experience: [
            {
                id: 'exp-1',
                role: 'Analyst',
                company: 'Paystack',
                start_date: '2023-01',
                end_date: '2025-06',
                description: 'Owned the merchant retention dashboard.',
                highlights: ['Cut churn by 12%'],
            },
        ],
        education: [
            { id: 'edu-1', institution: 'University of Lagos', degree: 'BSc', field: 'Economics' },
        ],
        projects: [{ id: 'p-1', name: 'Savings tracker', description: 'A budgeting app.' }],
        achievements: [{ id: 'a-1', title: 'Dean\'s List', description: 'Top 5% of cohort.' }],
        research: [
            {
                id: 'r-1',
                title: 'Mobile money adoption',
                institution: 'UNILAG',
                role: 'Research assistant',
                start_date: '2022-01',
                description: 'Survey of 400 traders.',
            },
        ],
        publications: [
            { id: 'pub-1', title: 'Adoption curves in West Africa', journal: 'JAE', date: '2024-03' },
        ],
        references: [
            { id: 'ref-1', name: 'Dr. Bello', title: 'Supervisor', organization: 'UNILAG' },
        ],
    },
};

describe('template design registry', () => {
    it('resolves by slug, id, legacy alias and name', () => {
        expect(resolveTemplateDesign({ slug: 'executive' }).slug).toBe('executive');
        expect(resolveTemplateDesign({ id: 'creative-portfolio' }).slug).toBe('creative-portfolio');
        // The original mock templates shipped as t-1/t-2/t-3.
        expect(resolveTemplateDesign({ id: 't-2' }).slug).toBe('academic-research');
        expect(resolveTemplateDesign({ id: 'db-uuid', name: 'Bold Impact' }).slug).toBe('bold-impact');
    });

    it('falls back to the ATS-plain default for unknown rows', () => {
        expect(resolveTemplateDesign({ id: 'who-knows' })).toBe(DEFAULT_TEMPLATE_DESIGN);
        expect(resolveTemplateDesign(null)).toBe(DEFAULT_TEMPLATE_DESIGN);
        expect(resolveTemplateDesignById(undefined)).toBe(DEFAULT_TEMPLATE_DESIGN);
        expect(DEFAULT_TEMPLATE_DESIGN.atsPlain).toBe(true);
    });
});

describe('buildCVHtml', () => {
    it('renders every registered template without throwing', () => {
        for (const design of Object.values(TEMPLATE_DESIGNS)) {
            const html = buildCVHtml(SAMPLE, design);
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Amina Okafor');
        }
    });

    it('produces a different document for every template', () => {
        const rendered = Object.values(TEMPLATE_DESIGNS).map((design) =>
            buildCVHtml(SAMPLE, design),
        );
        expect(new Set(rendered).size).toBe(rendered.length);
    });

    it('applies the template accent to the page', () => {
        const html = buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['modern-professional']);
        expect(html).toContain(TEMPLATE_DESIGNS['modern-professional'].accent);
    });

    it('derives the design from template_id when none is passed', () => {
        const fromId = buildCVHtml({ ...SAMPLE, template_id: 'executive' });
        const fromDesign = buildCVHtml(SAMPLE, TEMPLATE_DESIGNS.executive);
        expect(fromId).toBe(fromDesign);
    });

    it('emits Research, Publications and References only for Academic', () => {
        const academic = buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['academic-research']);
        expect(academic).toContain('Publications');
        expect(academic).toContain('Research');
        expect(academic).toContain('References');

        const modern = buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['modern-professional']);
        expect(modern).not.toContain('Publications');
        expect(modern).not.toContain('<h2>References</h2>');
    });

    it('honours each template section order', () => {
        // Creative leads with Projects; Executive leads with Experience.
        const creative = buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['creative-portfolio']);
        expect(creative.indexOf('Projects')).toBeLessThan(creative.indexOf('>Experience<'));

        const executive = buildCVHtml(SAMPLE, TEMPLATE_DESIGNS.executive);
        expect(executive.indexOf('>Experience<')).toBeLessThan(executive.indexOf('>Projects<'));
    });

    it('uses a serif stack for serif templates only', () => {
        expect(buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['academic-research'])).toContain('Georgia');
        expect(buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['minimal-ats'])).not.toContain('Georgia');
    });

    it('renders skills as chips, inline text or bullets per the spec', () => {
        expect(buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['modern-professional']))
            .toContain('class="skill"');
        // Inline templates must not emit chip markup — it is the ATS-safest form.
        expect(buildCVHtml(SAMPLE, TEMPLATE_DESIGNS['minimal-ats']))
            .not.toContain('class="skill"');
    });

    it('escapes user content', () => {
        const html = buildCVHtml(
            {
                data_json: {
                    header: { full_name: '<script>alert(1)</script>', email: 'a@b.co' },
                },
            },
            TEMPLATE_DESIGNS['minimal-ats'],
        );
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('renders an empty CV without crashing', () => {
        expect(() => buildCVHtml({}, TEMPLATE_DESIGNS['bold-impact'])).not.toThrow();
    });
});
