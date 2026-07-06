import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RoadmapIntake } from '../components/roadmap/RoadmapIntake';

const colors = {
  foreground: '#111827',
  textSecondary: '#64748B',
  accent: '#6366F1',
  border: '#E5E7EB',
  card: '#FFFFFF',
};

describe('RoadmapIntake', () => {
  it('renders both questions and all option chips', () => {
    const { getByText } = render(
      <RoadmapIntake value={{}} onChange={jest.fn()} colors={colors} />,
    );
    expect(getByText('How much time can you commit each week?')).toBeTruthy();
    expect(getByText('Where are you starting from?')).toBeTruthy();
    expect(getByText('5–10 hrs')).toBeTruthy();
    expect(getByText('Experienced')).toBeTruthy();
  });

  it('emits hoursPerWeek when a time chip is tapped', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RoadmapIntake value={{ currentLevel: 'beginner' }} onChange={onChange} colors={colors} />,
    );
    fireEvent.press(getByText('10–20 hrs'));
    // Preserves existing selections while updating hoursPerWeek.
    expect(onChange).toHaveBeenCalledWith({ currentLevel: 'beginner', hoursPerWeek: 15 });
  });

  it('emits currentLevel when a level chip is tapped', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RoadmapIntake value={{ hoursPerWeek: 8 }} onChange={onChange} colors={colors} />,
    );
    fireEvent.press(getByText('Some experience'));
    expect(onChange).toHaveBeenCalledWith({ hoursPerWeek: 8, currentLevel: 'intermediate' });
  });

  it('marks the selected chip via accessibility state', () => {
    const { getByText } = render(
      <RoadmapIntake value={{ currentLevel: 'advanced' }} onChange={jest.fn()} colors={colors} />,
    );
    // Walk up from the chip label to the pressable that carries accessibilityState.
    let node: any = getByText('Experienced');
    while (node && node.props?.accessibilityState === undefined) {
      node = node.parent;
    }
    expect(node?.props.accessibilityState).toEqual({ selected: true });
  });
});
