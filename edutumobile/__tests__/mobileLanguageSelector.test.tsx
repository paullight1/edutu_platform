/**
 * The app-language control is a dropdown: one row until tapped, then a sheet
 * with the full list.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { SUPPORTED_LANGUAGES } from '../lib/i18n';

const mockSetAppLanguage = jest.fn(async () => ({ needsRestart: false }));
let mockCurrent = 'en';

jest.mock('../lib/i18n', () => {
  const actual = jest.requireActual('../lib/i18n/languages');
  return {
    ...actual,
    getCurrentLanguage: () => mockCurrent,
    setAppLanguage: (code: string) => mockSetAppLanguage(code as never),
    restartApp: jest.fn(),
  };
});

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      foreground: '#0F172A', card: '#FFFFFF', border: '#E2E8F0',
      accent: '#4F46E5', background: '#FFFFFF',
    },
  }),
}));

beforeEach(() => {
  mockCurrent = 'en';
  jest.clearAllMocks();
});

describe('LanguageSelector', () => {
  it('collapses to a single row showing the active language', () => {
    const { getByLabelText, queryByLabelText } = render(<LanguageSelector />);

    // The trigger reports the current choice without expanding anything...
    expect(getByLabelText('App Language').props.accessibilityValue).toEqual({ text: 'English' });
    // ...and none of the other languages are on screen.
    for (const lang of SUPPORTED_LANGUAGES.filter((l) => l.code !== 'en')) {
      expect(queryByLabelText(lang.name)).toBeNull();
    }
  });

  it('opens a sheet listing every supported language', async () => {
    const { getByLabelText, getAllByLabelText } = render(<LanguageSelector />);
    fireEvent.press(getByLabelText('App Language'));

    await waitFor(() => expect(getAllByLabelText('French')).toHaveLength(1));
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(getAllByLabelText(lang.name).length).toBeGreaterThan(0);
    }
  });

  it('marks only the active language as selected', async () => {
    mockCurrent = 'fr';
    const { getByLabelText } = render(<LanguageSelector />);
    fireEvent.press(getByLabelText('App Language'));

    await waitFor(() => expect(getByLabelText('French').props.accessibilityState.selected).toBe(true));
    expect(getByLabelText('English').props.accessibilityState.selected).toBe(false);
  });

  it('applies a chosen language and collapses again', async () => {
    const { getByLabelText, queryByLabelText } = render(<LanguageSelector />);
    fireEvent.press(getByLabelText('App Language'));

    await waitFor(() => expect(getByLabelText('Swahili')).toBeTruthy());
    fireEvent.press(getByLabelText('Swahili'));

    await waitFor(() => expect(mockSetAppLanguage).toHaveBeenCalledWith('sw'));
    // Sheet closed, and the trigger now reflects the new choice.
    await waitFor(() => expect(queryByLabelText('French')).toBeNull());
    expect(getByLabelText('App Language').props.accessibilityValue).toEqual({ text: 'Kiswahili' });
  });

  it('does not re-apply the language already in use', async () => {
    const { getByLabelText, queryByLabelText } = render(<LanguageSelector />);
    fireEvent.press(getByLabelText('App Language'));

    await waitFor(() => expect(getByLabelText('English')).toBeTruthy());
    fireEvent.press(getByLabelText('English'));

    await waitFor(() => expect(queryByLabelText('French')).toBeNull());
    expect(mockSetAppLanguage).not.toHaveBeenCalled();
  });
});
