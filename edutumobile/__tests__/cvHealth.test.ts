import { analyzeCv, parseCvDate } from '@edutu/core/src/services/cvHealth';
import { TEMPLATE_DESIGNS } from '@edutu/core/src/services/templateDesigns';
import type { CVData } from '@edutu/core/src/types/cv';

function completeCv(): CVData {
    return {
        header: {
            full_name: 'Amina Okafor',
            email: 'amina@example.com',
            phone: '+234 801 234 5678',
            location: 'Lagos, Nigeria',
        },
        summary:
            'Product analyst with three years in fintech, focused on retention and merchant growth across West African markets.',
        skills: ['SQL', 'Python', 'Looker', 'Stakeholder management', 'Experiment design'],
        experience: [
            {
                id: 'exp-1',
                role: 'Analyst',
                company: 'Paystack',
                start_date: '2023-01',
                end_date: '2025-06',
                description: 'Owned the merchant retention dashboard used by 40 staff.',
                highlights: ['Cut churn by 12% in 2 quarters'],
            },
        ],
        education: [{ id: 'edu-1', institution: 'University of Lagos', degree: 'BSc' }],
    };
}

function idOf(checks: { id: string; status: string }[], id: string) {
    return checks.find((check) => check.id === id);
}

describe('parseCvDate', () => {
    it('reads the canonical and legacy shapes', () => {
        expect(parseCvDate('2023-03')).toBe(2023 * 12 + 2);
        expect(parseCvDate('03/2023')).toBe(2023 * 12 + 2);
        expect(parseCvDate('Mar 2023')).toBe(2023 * 12 + 2);
        expect(parseCvDate('March 2023')).toBe(2023 * 12 + 2);
        expect(parseCvDate('2023')).toBe(2023 * 12);
    });

    it('returns null for text it cannot understand', () => {
        expect(parseCvDate('sometime last year')).toBeNull();
        expect(parseCvDate('')).toBeNull();
        expect(parseCvDate(undefined)).toBeNull();
    });
});

describe('analyzeCv', () => {
    it('scores a complete CV as strong with no issues', () => {
        const report = analyzeCv(completeCv());
        expect(report.issues).toHaveLength(0);
        expect(report.score).toBe(100);
        expect(report.band).toBe('strong');
    });

    it('scores an empty CV as weak', () => {
        const report = analyzeCv({});
        expect(report.band).toBe('weak');
        expect(report.score).toBeLessThan(55);
        expect(idOf(report.checks, 'fullName')?.status).toBe('fail');
    });

    it('flags an invalid email but accepts an empty one as a separate failure', () => {
        const data = completeCv();
        data.header!.email = 'not-an-email';
        expect(idOf(analyzeCv(data).checks, 'email')?.status).toBe('fail');
    });

    it('flags bullets that carry no number', () => {
        const data = completeCv();
        data.experience![0].highlights = ['Improved things a lot'];
        data.experience![0].description = 'Did work on the dashboard.';
        const check = idOf(analyzeCv(data).checks, 'quantified');
        expect(check?.status).toBe('fail');
        expect(check?.values?.count).toBe(2);
    });

    it('flags dates that end before they start', () => {
        const data = completeCv();
        data.experience![0].start_date = '2025-01';
        data.experience![0].end_date = '2023-01';
        expect(idOf(analyzeCv(data).checks, 'datesOrder')?.status).toBe('fail');
    });

    it('ignores a missing end date when the role is current', () => {
        const data = completeCv();
        data.experience![0].current = true;
        data.experience![0].end_date = '';
        expect(idOf(analyzeCv(data).checks, 'datesOrder')?.status).toBe('pass');
        expect(idOf(analyzeCv(data).checks, 'datesParse')?.status).toBe('pass');
    });

    it('flags unreadable dates', () => {
        const data = completeCv();
        data.experience![0].start_date = 'last summer';
        expect(idOf(analyzeCv(data).checks, 'datesParse')?.status).toBe('fail');
    });

    it('warns when the template promises sections the CV cannot fill', () => {
        const report = analyzeCv(completeCv(), TEMPLATE_DESIGNS['academic-research']);
        const fit = idOf(report.checks, 'templateFit');
        expect(fit?.status).toBe('fail');
        expect(String(fit?.values?.sections)).toContain('publications');
    });

    it('passes template fit when the content is there', () => {
        const data = completeCv();
        data.publications = [{ id: 'p1', title: 'A paper', date: '2024-01' }];
        data.research = [
            { id: 'r1', title: 'A study', institution: 'UNILAG', role: 'RA', start_date: '2022-01', description: 'x' },
        ];
        const fit = idOf(analyzeCv(data, TEMPLATE_DESIGNS['academic-research']).checks, 'templateFit');
        expect(fit?.status).toBe('pass');
    });

    it('sorts issues with critical failures first', () => {
        const report = analyzeCv({ header: { full_name: '', email: '' }, skills: ['One'] });
        expect(report.issues[0].severity).toBe('critical');
    });

    it('routes each check to the step that can fix it', () => {
        const report = analyzeCv({});
        expect(idOf(report.checks, 'fullName')?.step).toBe('basics');
        expect(idOf(report.checks, 'skills')?.step).toBe('summary');
        expect(idOf(report.checks, 'experience')?.step).toBe('experience');
        expect(idOf(report.checks, 'education')?.step).toBe('education');
    });
});
