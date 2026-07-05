import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RoadmapTimeline } from '../components/roadmap/RoadmapTimeline';

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (_t, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') return () => <Text>{prop}</Text>;
        return undefined;
      },
    },
  );
});

const colors = {
  foreground: '#111827',
  textSecondary: '#64748B',
  accent: '#6366F1',
  success: '#10B981',
  border: '#E5E7EB',
  card: '#FFFFFF',
};

const milestones = [
  { id: 'm1', title: 'Draft your SOP', description: 'Write the first draft.', date: '2026-07-12' },
  { id: 'm2', title: 'Secure references', description: 'Ask referees early.', date: '2026-07-20' },
  { id: 'm3', title: 'Submit', description: 'Send it in.', date: '2026-07-28' },
];

describe('RoadmapTimeline', () => {
  it('renders every milestone with its title and description', () => {
    const { getByText } = render(
      <RoadmapTimeline milestones={milestones} colors={colors} today={new Date('2026-07-05')} />,
    );
    expect(getByText('Draft your SOP')).toBeTruthy();
    expect(getByText('Secure references')).toBeTruthy();
    expect(getByText('Submit')).toBeTruthy();
    expect(getByText('Ask referees early.')).toBeTruthy();
  });

  it('toggles a milestone when its row is pressed', () => {
    const onToggle = jest.fn();
    const { getByText } = render(
      <RoadmapTimeline milestones={milestones} onToggle={onToggle} colors={colors} today={new Date('2026-07-05')} />,
    );
    fireEvent.press(getByText('Secure references'));
    expect(onToggle).toHaveBeenCalledWith('m2');
  });

  it('renders a completed milestone with a check and marks it via accessibility state', () => {
    const { getByText, getByLabelText } = render(
      <RoadmapTimeline milestones={milestones} completedIds={['m1']} colors={colors} today={new Date('2026-07-05')} />,
    );
    // lucide Check icon is mocked to render its name.
    expect(getByText('Check')).toBeTruthy();
    const doneRow = getByLabelText('Draft your SOP, done');
    expect(doneRow.props.accessibilityState).toEqual({ checked: true });
  });

  it('shows a TODAY marker when today falls partway through the plan', () => {
    // today = Jul 15 → first milestone with date >= today is m2 (index 1) → marker shows.
    const { getByText } = render(
      <RoadmapTimeline milestones={milestones} colors={colors} today={new Date('2026-07-15')} />,
    );
    expect(getByText('TODAY')).toBeTruthy();
  });

  it('omits the TODAY marker when the whole plan is still upcoming', () => {
    const { queryByText } = render(
      <RoadmapTimeline milestones={milestones} colors={colors} today={new Date('2026-07-01')} />,
    );
    // todayIndex would be 0, and the marker only renders when index > 0.
    expect(queryByText('TODAY')).toBeNull();
  });

  it('shows a remove button only when onRemove is provided and calls it', () => {
    const onRemove = jest.fn();
    const { getByLabelText, queryByLabelText, rerender } = render(
      <RoadmapTimeline milestones={milestones} colors={colors} today={new Date('2026-07-05')} />,
    );
    expect(queryByLabelText('Remove Draft your SOP')).toBeNull();

    rerender(
      <RoadmapTimeline milestones={milestones} onRemove={onRemove} colors={colors} today={new Date('2026-07-05')} />,
    );
    fireEvent.press(getByLabelText('Remove Secure references'));
    expect(onRemove).toHaveBeenCalledWith('m2');
  });

  it('renders only the first N milestones when visibleCount is set (staggered reveal)', () => {
    const { getByText, queryByText, rerender } = render(
      <RoadmapTimeline milestones={milestones} colors={colors} today={new Date('2026-07-05')} visibleCount={1} />,
    );
    expect(getByText('Draft your SOP')).toBeTruthy();
    expect(queryByText('Secure references')).toBeNull();
    expect(queryByText('Submit')).toBeNull();

    rerender(
      <RoadmapTimeline milestones={milestones} colors={colors} today={new Date('2026-07-05')} visibleCount={3} />,
    );
    expect(getByText('Secure references')).toBeTruthy();
    expect(getByText('Submit')).toBeTruthy();
  });
});
