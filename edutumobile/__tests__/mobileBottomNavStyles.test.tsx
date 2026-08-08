/**
 * The four bottom-nav styles: shape, and where the contextual action lives.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { Home, Compass, Map, Users, User } from 'lucide-react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { NavBarStyle } from '../lib/navStyleStore';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
  useLocalSearchParams: () => ({}),
  Stack: Object.assign(({ children }: any) => children ?? null, { Screen: () => null }),
  Slot: () => null,
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'u1', getToken: jest.fn() }),
  useUser: () => ({ user: { id: 'u1' } }),
}));

const mockOpenVoiceMode = jest.fn();
jest.mock('../lib/voiceModeStore', () => ({
  openVoiceMode: (...args: unknown[]) => mockOpenVoiceMode(...args),
  useVoiceModeState: () => ({ open: false, intent: 'chat' }),
}));

const TABS = [
  { key: 'home', route: '/', label: 'Home', icon: Home },
  { key: 'groups', route: '/discussions', label: 'Groups', icon: Users },
  { key: 'opportunities', route: '/opportunities', label: 'Explore', icon: Compass },
  { key: 'roadmaps', route: '/roadmaps', label: 'Plan', icon: Map },
  { key: 'menu', route: '/profile', label: 'More', icon: User },
];

const COLORS = {
  accent: '#6366F1', card: '#FFFFFF', border: '#E2E8F0',
  background: '#FFFFFF', muted: '#F1F5F9',
};

async function renderNav(
  style: NavBarStyle,
  overrides: Partial<React.ComponentProps<typeof import('../app/(app)/_layout').BottomNav>> = {},
) {
  const { setNavBarStyle } = require('../lib/navStyleStore');
  const { BottomNav } = require('../app/(app)/_layout');
  setNavBarStyle(style);

  const onCirclePress = jest.fn();
  const onTabPress = jest.fn();
  const utils = render(
    <BottomNav
      tabs={TABS}
      activeRoute="home"
      onTabPress={onTabPress}
      circleAction={{ kind: 'ai', target: '/chat' }}
      circleHidden={false}
      onCirclePress={onCirclePress}
      createDialOpen={false}
      isDark={false}
      colors={COLORS}
      {...overrides}
    />,
  );
  return { ...utils, onCirclePress, onTabPress };
}

// The circle tucks itself away by disabling touches on its animated wrapper,
// so the flag lives on an ancestor of the button rather than the button.
function isTucked(node: any): boolean {
  for (let n = node; n; n = n.parent) {
    if (n.props?.pointerEvents === 'none') return true;
  }
  return false;
}

describe('bottom nav styles', () => {
  it.each(['glass', 'fab', 'tabs', 'center'] as const)('%s renders every tab', async (style) => {
    const { getByLabelText } = await renderNav(style);
    for (const tab of TABS) {
      expect(getByLabelText(tab.label)).toBeTruthy();
    }
  });

  it.each(['glass', 'fab', 'tabs', 'center'] as const)(
    '%s exposes the contextual action exactly once',
    async (style) => {
      const { getAllByLabelText } = await renderNav(style);
      expect(getAllByLabelText('Open Edutu AI')).toHaveLength(1);
    },
  );

  it('glass floats inset from the screen edges as a rounded pill', async () => {
    const { getByTestId, queryByTestId } = await renderNav('glass');
    expect(queryByTestId('nav-bar-surface')).toBeNull();

    const row = StyleSheet.flatten(getByTestId('nav-pill-surface').props.style);
    expect(row.left).toBe(14);       // inset from the edges…
    expect(row.right).toBe(14);
    expect(row.bottom).toBeGreaterThan(0);  // …and lifted off the bottom
  });

  it.each(['fab', 'tabs', 'center'] as const)(
    '%s spans the full width and sits flush on the bottom edge',
    async (style) => {
      const { getByTestId, queryByTestId } = await renderNav(style);
      expect(queryByTestId('nav-pill-surface')).toBeNull();

      const bar = StyleSheet.flatten(getByTestId('nav-bar-surface').props.style);
      expect(bar.left).toBe(0);
      expect(bar.right).toBe(0);
      expect(bar.bottom).toBe(0);
      expect(bar.borderRadius).toBeUndefined();          // square, not a pill
      expect(bar.borderTopWidth).toBeGreaterThan(0);     // hairline on top
      expect(bar.backgroundColor).toBe(COLORS.card);     // opaque, no blur
    },
  );

  it('only the glass style collapses its tabs away from the non-home tabs', async () => {
    // On Plan the glass pill compresses into the circle, so its tabs stop
    // taking touches. The bar styles must keep every tab tappable.
    const glass = await renderNav('glass', {
      activeRoute: 'roadmaps',
      circleAction: { kind: 'create', target: '/goals/add' },
    });
    await waitFor(() => expect(glass.getByLabelText('Create goal or roadmap')).toBeTruthy());

    const bar = await renderNav('tabs', {
      activeRoute: 'roadmaps',
      circleAction: { kind: 'create', target: '/goals/add' },
    });
    expect(bar.getByLabelText('Home')).toBeTruthy();
    expect(bar.getByLabelText('Create goal or roadmap')).toBeTruthy();
  });

  // The profile screen hides the action once its header scrolls away. That
  // suits something floating over the content, but a button anchored in the
  // bar must stay put rather than leave a gap.
  it.each([
    ['glass', false],
    ['fab', false],
    ['tabs', true],
    ['center', true],
  ] as const)('%s keeps its action visible while scrolling: %s', async (style, staysVisible) => {
    const { getByLabelText } = await renderNav(style, {
      activeRoute: 'menu',
      circleAction: { kind: 'edit', target: '/profile/edit' },
      circleHidden: true,
    });
    expect(isTucked(getByLabelText('Edit profile'))).toBe(!staysVisible);
  });

  it('the tabs style keeps hold-for-voice on the in-bar AI item', async () => {
    const { getByLabelText } = await renderNav('tabs');
    expect(getByLabelText('Open Edutu AI').props.accessibilityHint).toBe('Hold for voice mode');
  });

  it.each(['glass', 'fab', 'tabs', 'center'] as const)(
    '%s routes a contextual tap through onCirclePress',
    async (style) => {
      const { getByLabelText, onCirclePress } = await renderNav(style);
      fireEvent.press(getByLabelText('Open Edutu AI'));
      expect(onCirclePress).toHaveBeenCalledWith({ kind: 'ai', target: '/chat' });
    },
  );

  it.each(['glass', 'fab', 'tabs', 'center'] as const)('%s routes tab taps', async (style) => {
    const { getByLabelText, onTabPress } = await renderNav(style);
    fireEvent.press(getByLabelText('Explore'));
    expect(onTabPress).toHaveBeenCalledWith('opportunities', '/opportunities');
  });
});
