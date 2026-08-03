import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScreenState } from '@edutu/ux-state/state';
import { StateView } from '@/components/state/StateView';
import { InlineError } from '@/components/state/InlineError';

const STATES: ScreenState[] = [
  { kind: 'loading' },
  { kind: 'empty', reason: 'firstRun' },
  { kind: 'empty', reason: 'filtered' },
  { kind: 'partial', staleAt: null },
  { kind: 'error', cause: 'network' },
  { kind: 'error', cause: 'auth' },
  { kind: 'error', cause: 'notFound' },
  { kind: 'error', cause: 'server' },
  { kind: 'error', cause: 'timeout' },
  { kind: 'offline' },
  { kind: 'locked', reason: 'pro' },
  { kind: 'locked', reason: 'guest' },
  { kind: 'locked', reason: 'module' },
  { kind: 'denied', permission: 'notifications' },
  { kind: 'denied', permission: 'camera' },
  { kind: 'denied', permission: 'calendar' },
  { kind: 'denied', permission: 'photos' },
];

describe('web StateView', () => {
  it('renders a scene and a title for every non-ready state', () => {
    for (const state of STATES) {
      const { container, unmount } = render(<StateView state={state} flow="saved" />);
      expect(container.querySelector('svg')).not.toBeNull();
      expect(container.querySelector('h3')?.textContent?.length ?? 0).toBeGreaterThan(0);
      unmount();
    }
  });

  it('gives each error cause its own words, not one shrug for all five', () => {
    const titles = new Set<string>();
    for (const cause of ['network', 'auth', 'notFound', 'server', 'timeout'] as const) {
      const { container, unmount } = render(
        <StateView state={{ kind: 'error', cause }} flow="home" />,
      );
      titles.add(container.querySelector('h3')!.textContent!);
      unmount();
    }
    expect(titles.size).toBe(5);
  });

  it('renders nothing for the states a screen owns itself', () => {
    for (const state of [{ kind: 'ready' }, { kind: 'refreshing' }] as ScreenState[]) {
      const { container } = render(<StateView state={state} flow="home" />);
      expect(container.firstChild).toBeNull();
    }
  });

  it('shows a retry action on an error and calls back', () => {
    const onRetry = vi.fn();
    render(<StateView state={{ kind: 'error', cause: 'server' }} flow="home" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not offer retry on a first-run empty — there is nothing to retry', () => {
    render(<StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="goals" />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('draws a different scene per flow for a first-run empty', () => {
    const saved = render(<StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="saved" />);
    const goals = render(<StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="goals" />);
    expect(saved.container.querySelector('svg')?.innerHTML).not.toBe(
      goals.container.querySelector('svg')?.innerHTML,
    );
  });

  it('draws the same scene for a filtered empty whatever the flow', () => {
    const a = render(<StateView state={{ kind: 'empty', reason: 'filtered' }} flow="saved" />);
    const b = render(<StateView state={{ kind: 'empty', reason: 'filtered' }} flow="goals" />);
    expect(a.container.querySelector('svg')?.innerHTML).toBe(
      b.container.querySelector('svg')?.innerHTML,
    );
  });

  it('lets a screen override the copy', () => {
    render(
      <StateView
        state={{ kind: 'offline' }}
        flow="home"
        title="No signal"
        body="Reconnect to see new roles."
      />,
    );
    expect(screen.getByText('No signal')).toBeTruthy();
    expect(screen.getByText('Reconnect to see new roles.')).toBeTruthy();
  });
});

describe('InlineError', () => {
  it('renders the message and calls retry', () => {
    const onRetry = vi.fn();
    render(<InlineError message="Could not save" onRetry={onRetry} />);
    expect(screen.getByText('Could not save')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders without a retry affordance when none is given', () => {
    render(<InlineError message="Could not save" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
