import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import LandingPageV3 from '../../components/LandingPageV3';

vi.mock('../../hooks/useDarkMode', () => ({
  useDarkMode: () => ({
    isDarkMode: false,
    toggleDarkMode: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement> & Record<string, unknown>) => {
          const {
            animate,
            exit,
            initial,
            transition,
            viewport,
            whileHover,
            whileInView,
            whileTap,
            ...domProps
          } = props;

          void animate;
          void exit;
          void initial;
          void transition;
          void viewport;
          void whileHover;
          void whileInView;
          void whileTap;

          return React.createElement(tag, domProps, children);
        },
    }
  ),
  useScroll: () => ({ scrollYProgress: 0 }),
  useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
}));

describe('LandingPageV3 footer', () => {
  it('shows a public Admin link to the integrated admin route', () => {
    render(
      <BrowserRouter>
        <LandingPageV3 onGetStarted={vi.fn()} />
      </BrowserRouter>
    );

    const adminLink = screen.getByRole('link', { name: 'Admin' });

    expect(adminLink).toHaveAttribute('href', '/admin');
  });
});
