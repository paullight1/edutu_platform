import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { classifyError } from '@edutu/ux-state/state';
import { StateView } from '@/components/state';

// SavedPage itself needs Clerk, a router and a live fetch, so its wiring is
// asserted through the contract it now delegates to rather than by mounting it.
describe('SavedPage states', () => {
  it('shows the saved first-run scene, not a generic one', () => {
    const { container } = render(
      <StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="saved" />,
    );
    expect(screen.getByText(/nothing saved yet/i)).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('tells an expired session apart from a server fault', () => {
    const auth = render(<StateView state={{ kind: 'error', cause: 'auth' }} flow="saved" />);
    const server = render(<StateView state={{ kind: 'error', cause: 'server' }} flow="saved" />);
    expect(auth.container.querySelector('h3')!.textContent).not.toBe(
      server.container.querySelector('h3')!.textContent,
    );
  });

  it('classifies a missing Clerk token as auth, so the user is asked to sign in', () => {
    // The screen throws this exact shape when getToken() returns nothing. A
    // bare Error would classify as `server` and offer a Retry that cannot fix
    // an expired session.
    const expired = Object.assign(new Error('Your session has expired.'), { status: 401 });
    expect(classifyError(expired)).toBe('auth');
  });
});
