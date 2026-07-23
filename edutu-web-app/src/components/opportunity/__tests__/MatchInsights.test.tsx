import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
    MatchScoreBadge,
    WhyThisMatches,
    getMatchLabel,
} from '../MatchInsights';

describe('getMatchLabel', () => {
    it('returns fit-tier language per score band', () => {
        expect(getMatchLabel(85)).toBe('Excellent fit');
        expect(getMatchLabel(65)).toBe('Strong fit');
        expect(getMatchLabel(45)).toBe('Good fit');
        expect(getMatchLabel(20)).toBe('Worth a look');
    });

    it('never returns a percentage or the word "match"', () => {
        for (const score of [95, 80, 79, 60, 59, 40, 39, 0]) {
            const label = getMatchLabel(score);
            expect(label).not.toMatch(/%/);
            expect(label.toLowerCase()).not.toContain('match');
        }
    });
});

describe('MatchScoreBadge', () => {
    it('shows fit tier, never a percentage', () => {
        render(<MatchScoreBadge score={87} />);
        expect(screen.getByText(/Excellent fit/)).toBeInTheDocument();
        expect(screen.queryByText(/%/)).toBeNull();
    });

    it('renders no % across tiers', () => {
        for (const score of [95, 70, 50, 25]) {
            const { unmount } = render(<MatchScoreBadge score={score} />);
            expect(screen.queryByText(/%/)).toBeNull();
            unmount();
        }
    });
});

describe('WhyThisMatches', () => {
    it('header shows fit tier, never a percentage', () => {
        render(
            <WhyThisMatches
                score={87}
                reasons={[
                    {
                        kind: 'field',
                        label: 'Matches your field of study',
                        points: 10,
                    },
                ]}
            />,
        );
        expect(screen.getByText(/Excellent fit/)).toBeInTheDocument();
        expect(screen.queryByText(/%/)).toBeNull();
    });
});
