import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ScrapeJobDetailsModal from './ScrapeJobDetailsModal';
import type { ScrapeJob, ScrapedOpportunity } from '../../types/scraper';

const job: ScrapeJob = {
    id: 'job-1',
    source_id: 1,
    source_name: 'Scholarships Example',
    run_type: 'manual',
    status: 'completed',
    urls_discovered: 2,
    urls_scraped: 2,
    errors: [],
    warnings: [],
    duration_seconds: 12,
    started_at: '2026-08-06T10:00:00.000Z',
    completed_at: '2026-08-06T10:00:12.000Z',
};

const opportunity: ScrapedOpportunity = {
    id: 'opp-1',
    title: 'Africa Scholarship',
    category: 'scholarship',
    description: 'A scholarship for African students.',
    location: 'Africa',
    amount: 1000,
    application_url: 'https://example.com/apply',
    source: 'Scholarships Example',
};

function renderModal(overrides: Partial<React.ComponentProps<typeof ScrapeJobDetailsModal>> = {}) {
    const props: React.ComponentProps<typeof ScrapeJobDetailsModal> = {
        job,
        opportunities: [opportunity],
        loading: false,
        saving: false,
        improving: false,
        onClose: vi.fn(),
        onSaveAll: vi.fn(),
        onImproveAll: vi.fn(),
        ...overrides,
    };
    return { ...render(<ScrapeJobDetailsModal {...props} />), props };
}

describe('ScrapeJobDetailsModal', () => {
    it('renders job metadata and opportunity details', () => {
        renderModal();

        expect(screen.getByText('Job Details: Scholarships Example')).toBeInTheDocument();
        expect(screen.getByText('Africa Scholarship')).toBeInTheDocument();
        expect(screen.getByText('scholarship')).toBeInTheDocument();
        expect(screen.getByText('$1,000')).toBeInTheDocument();
        expect(screen.getByText('1 opportunity in this run')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute('href', opportunity.application_url);
    });

    it('shows loading and empty states', () => {
        const { rerender } = renderModal({ loading: true, opportunities: [] });
        expect(screen.getByText('Loading associated opportunities...')).toBeInTheDocument();

        rerender(
            <ScrapeJobDetailsModal
                job={job}
                opportunities={[]}
                loading={false}
                saving={false}
                improving={false}
                onClose={vi.fn()}
                onSaveAll={vi.fn()}
                onImproveAll={vi.fn()}
            />,
        );
        expect(screen.getByText('No metadata records found')).toBeInTheDocument();
    });

    it('fires callbacks and disables destructive actions while busy', () => {
        const { props, unmount } = renderModal({ saving: true });

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /improve with ai/i })).toBeDisabled();

        unmount();
        const { props: idleProps } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: /improve with ai/i }));
        fireEvent.click(screen.getByRole('button', { name: /save all/i }));
        expect(idleProps.onImproveAll).toHaveBeenCalledTimes(1);
        expect(idleProps.onSaveAll).toHaveBeenCalledTimes(1);
    });
});
