import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import type { ScreenState } from '@edutu/ux-state/state';
import { StateView } from '../StateView';
import { ThemeProvider } from '../../context/ThemeContext';

/** Every state a screen can hand to StateView, except the two it renders null for. */
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

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('StateView', () => {
  it('renders every non-ready state without throwing', () => {
    for (const state of STATES) {
      const { unmount } = wrap(<StateView state={state} flow="saved" />);
      unmount();
    }
  });

  it('draws a scene for every state — none falls back to a bare glyph', async () => {
    for (const state of STATES) {
      const { toJSON, unmount } = wrap(<StateView state={state} flow="goals" />);
      await waitFor(() => expect(toJSON()).not.toBeNull());
      // Every scene is an <Svg>; react-native-svg serialises its viewBox as
      // vbWidth/vbHeight rather than as a viewBox string.
      expect(JSON.stringify(toJSON())).toContain('"vbWidth":240');
      unmount();
    }
  });

  it('renders nothing for the states a screen owns itself', () => {
    for (const state of [{ kind: 'ready' }, { kind: 'refreshing' }] as ScreenState[]) {
      const { toJSON } = wrap(<StateView state={state} flow="home" />);
      expect(toJSON()).toBeNull();
    }
  });

  it('lets a screen override the copy', async () => {
    const { getByText } = wrap(
      <StateView state={{ kind: 'offline' }} flow="home" title="No signal" body="Reconnect." />,
    );
    await waitFor(() => expect(getByText('No signal')).toBeTruthy());
    expect(getByText('Reconnect.')).toBeTruthy();
  });

  it('shrinks the scene rather than dropping it on dense surfaces', async () => {
    const { toJSON } = wrap(<StateView state={{ kind: 'offline' }} flow="home" sceneSize={64} />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
    const tree = JSON.stringify(toJSON());
    // Same geometry, smaller stage — the scene is scaled, never dropped.
    expect(tree).toContain('"vbWidth":240');
    expect(tree).toContain('"width":64');
  });
});
