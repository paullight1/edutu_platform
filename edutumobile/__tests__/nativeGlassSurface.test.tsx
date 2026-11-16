import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { NativeGlassSurface } from '../components/ui/NativeGlassSurface';
import { isGlassEffectAPIAvailable } from 'expo-glass-effect';

jest.mock('expo-glass-effect', () => ({
  GlassView: (props: object) => require('react').createElement(require('react-native').View, { ...props, testID: 'native-material' }),
  isLiquidGlassAvailable: jest.fn(() => true),
  isGlassEffectAPIAvailable: jest.fn(() => true),
}));
const props = { radius: 24, isDark: true, surface: '#064E3B', border: '#065F46' };
beforeEach(() => {
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());
it('uses native regular glass with the app theme when the device supports it', async () => {
  const screen = render(<NativeGlassSurface {...props} />);
  await waitFor(() => expect(screen.getByTestId('native-material')).toBeTruthy());
  expect(screen.getByTestId('native-material').props.colorScheme).toBe('dark');
  expect(screen.getByTestId('native-material').props.glassEffectStyle).toBe('regular');
});
it('keeps a solid surface when Reduce Transparency is enabled', async () => {
  jest.mocked(AccessibilityInfo.isReduceTransparencyEnabled).mockResolvedValue(true);
  const screen = render(<NativeGlassSurface {...props} />);
  await waitFor(() => expect(AccessibilityInfo.isReduceTransparencyEnabled).toHaveBeenCalled());
  expect(screen.queryByTestId('native-material')).toBeNull();
});
it('keeps the high contrast surface opaque', async () => {
  const screen = render(<NativeGlassSurface {...props} highContrast />);
  await waitFor(() => expect(AccessibilityInfo.isReduceTransparencyEnabled).toHaveBeenCalled());
  expect(screen.queryByTestId('native-material')).toBeNull();
});
it('does not mount native glass when its runtime API is missing', () => {
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(false);
  const screen = render(<NativeGlassSurface {...props} />);
  expect(screen.queryByTestId('native-material')).toBeNull();
});
