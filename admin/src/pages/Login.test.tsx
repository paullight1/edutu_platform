import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import { getLoginErrorMessage } from './loginErrors';

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword } },
}));

describe('admin login errors', () => {
  beforeEach(() => signInWithPassword.mockReset());

  it('hides provider infrastructure details behind a useful temporary error', () => {
    expect(getLoginErrorMessage(new Error('Database error querying schema')))
      .toBe('Sign-in is temporarily unavailable. Please try again shortly.');
    expect(getLoginErrorMessage(new Error('Failed to fetch')))
      .toBe('Sign-in is temporarily unavailable. Please try again shortly.');
  });

  it('keeps incorrect credentials actionable', () => {
    expect(getLoginErrorMessage(new Error('Invalid login credentials')))
      .toBe('Invalid email or password. Check your details and try again.');
  });

  it('announces a friendly infrastructure error and associates labels with inputs', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Database error querying schema' } });
    render(<MemoryRouter><Login /></MemoryRouter>);

    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in is temporarily unavailable. Please try again shortly.',
    );
    expect(screen.queryByText('Database error querying schema')).not.toBeInTheDocument();
  });

  it('reports invalid credentials without exposing provider text', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'));
  });
});
