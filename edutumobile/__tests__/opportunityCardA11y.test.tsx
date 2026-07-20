import React from 'react';
import { render } from '@testing-library/react-native';
import { OpportunityCard } from '../components/home/OpportunityCard';
import { Opportunity } from '@edutu/core/src/types/opportunity';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') {
          return () => <Text>{prop}</Text>;
        }
        return undefined;
      },
    },
  );
});

const baseItem: Opportunity = {
  id: 'opp-1',
  title: 'Chevening Scholarship',
  organization: 'UK Government',
  category: 'Scholarship',
  location: 'United Kingdom',
  description: 'Fully funded masters',
  deadline: '2030-11-05T00:00:00.000Z',
  tags: [],
  aiTags: [],
  requirements: [],
  benefits: [],
} as unknown as Opportunity;

describe('OpportunityCard accessibility', () => {
  // A screen-reader user must be able to tell what each icon-only control
  // does — "save this opportunity", not "bookmark icon" — and hear it
  // change once the item is actually saved.
  it('labels the share, bookmark, and more-options controls', () => {
    const { getByLabelText } = render(
      <OpportunityCard
        item={baseItem}
        isDark={false}
        textPrimary="#111827"
        textSecondary="#64748B"
        accent="#6366F1"
        onShare={jest.fn()}
        onBookmark={jest.fn()}
        onNotInterested={jest.fn()}
        bookmarked={false}
      />,
    );

    expect(getByLabelText('Share this opportunity')).toBeTruthy();
    expect(getByLabelText('Save opportunity')).toBeTruthy();

    const moreButton = getByLabelText('More options');
    expect(moreButton.props.accessibilityHint).toBe('Mark this opportunity as not interested');
  });

  it('flips the bookmark label once the opportunity is already saved', () => {
    const { getByLabelText, queryByLabelText } = render(
      <OpportunityCard
        item={baseItem}
        isDark={false}
        textPrimary="#111827"
        textSecondary="#64748B"
        accent="#6366F1"
        onBookmark={jest.fn()}
        bookmarked
      />,
    );

    expect(getByLabelText('Remove from saved')).toBeTruthy();
    expect(queryByLabelText('Save opportunity')).toBeNull();
  });

  it('does not render bookmark/share/more controls when no handler is supplied', () => {
    const { queryByLabelText } = render(
      <OpportunityCard
        item={baseItem}
        isDark={false}
        textPrimary="#111827"
        textSecondary="#64748B"
        accent="#6366F1"
      />,
    );

    expect(queryByLabelText('Share this opportunity')).toBeNull();
    expect(queryByLabelText('Save opportunity')).toBeNull();
    expect(queryByLabelText('More options')).toBeNull();
  });
});
