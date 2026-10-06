import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GoogleOneTapGate from './GoogleOneTapGate';
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signedIn: false, remember: vi.fn() }));
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: mocks.signedIn }) }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ signInWithGoogle: mocks.signIn }) }));
vi.mock('../lib/auth', () => ({ rememberPostAuthRedirect: mocks.remember }));
function Location() { return <output>{useLocation().pathname}</output>; }
function visit(path: string) {
  render(<MemoryRouter initialEntries={[path]}><a href="/opportunities">Explore opportunities</a><GoogleOneTapGate /><Location /></MemoryRouter>);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.signedIn = false; });
describe('public Google sign-in invitation', () => {
  it('offers only Google while leaving public content usable', () => {
    visit('/');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
    expect(screen.getByRole('link', { name: 'Explore opportunities' })).toBeVisible();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep exploring' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('dismisses an auth entry back to the public homepage', () => {
    visit('/auth?mode=sign-in');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('status').textContent).toBe('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('preserves the protected destination when starting Google OAuth', () => {
    mocks.signIn.mockResolvedValue(undefined);
    visit('/auth?redirect=%2Fapp%2Fsaved');
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(mocks.remember).toHaveBeenCalledWith({ pathname: '/app/saved' });
    expect(mocks.signIn).toHaveBeenCalledOnce();
  });
  it('does not show an invitation during OAuth callbacks or for signed-in users', () => {
    visit('/auth/callback');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    cleanup();
    mocks.signedIn = true;
    visit('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
