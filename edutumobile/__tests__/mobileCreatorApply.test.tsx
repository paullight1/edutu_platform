import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity, View } from 'react-native';

const mockReplace = jest.fn();
const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockUpdateEq = jest.fn().mockResolvedValue({ data: null, error: null });
const mockLaunchImageLibraryAsync = jest.fn();
const mockStorageUpload = jest.fn().mockResolvedValue({ data: null, error: null });
const mockGetPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://files.example.com/kyc.jpg' } }));

let mockUserState: { user: any } = {
  user: {
    id: 'creator-user-1',
    fullName: 'Amina Creator',
    imageUrl: null,
    primaryEmailAddress: { emailAddress: 'amina.creator@example.com' },
  },
};

const mockSupabase = {
  from: jest.fn((table: string) => {
    if (table === 'creator_applications') {
      return {
        insert: (...args: unknown[]) => mockInsert(...args),
      };
    }

    if (table === 'profiles') {
      return {
        update: () => ({
          eq: (...args: unknown[]) => mockUpdateEq(...args),
        }),
      };
    }

    return {};
  }),
  storage: {
    from: jest.fn(() => ({
      upload: (...args: unknown[]) => mockStorageUpload(...args),
      getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
    })),
  },
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => mockUserState,
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#146ef5',
      primary: '#146ef5',
      textSecondary: '#64748B',
    },
  }),
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, subtitle, showBack }: { title: string; subtitle?: string; showBack?: boolean }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  },
}));

jest.mock('../components/ui/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{`Avatar:${name}`}</Text>;
  },
}));

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const icon = (name: string) => () => <Text>{name}</Text>;
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') return icon(prop);
        return undefined;
      },
    },
  );
});

const CreatorApplyScreen = require('../app/(app)/creator-apply').default;

function findNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }

  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }

  return current;
}

async function pressNearestTouchTarget(node: any) {
  const current = findNearestTouchTarget(node);
  await act(async () => {
    await current.props.onPress?.();
  });
}

async function uploadKycDocument(getByText: any) {
  await pressNearestTouchTarget(getByText('Tap to upload'));
  await waitFor(() => expect(getByText('Verified')).toBeTruthy());
}

async function fillApplicationToReview(options: {
  getByText: any;
  getByPlaceholderText: any;
  motivation?: string;
  opportunityType?: string;
  opportunityTitle?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  bio?: string;
  socialLinks?: string;
}) {
  const {
    getByText,
    getByPlaceholderText,
    motivation = 'I want to give back to the community',
    opportunityType = 'Scholarship',
    opportunityTitle = 'Mastercard Foundation Scholarship 2024',
    linkedinUrl = 'https://linkedin.com/in/amina',
    portfolioUrl = 'https://portfolio.example.com',
    bio = 'Creator bio',
    socialLinks = 'Twitter, YouTube',
  } = options;

  await pressNearestTouchTarget(getByText('Continue'));
  await waitFor(() => expect(getByText('What motivates you?')).toBeTruthy());

  await pressNearestTouchTarget(getByText(motivation));
  await pressNearestTouchTarget(getByText('Continue'));

  await waitFor(() => expect(getByText('Your Achievement')).toBeTruthy());
  await pressNearestTouchTarget(getByText(opportunityType));
  fireEvent.changeText(getByPlaceholderText('e.g., Mastercard Foundation Scholarship 2024'), opportunityTitle);
  fireEvent.changeText(getByPlaceholderText('https://linkedin.com/in/yourprofile'), linkedinUrl);
  fireEvent.changeText(getByPlaceholderText('Link to your portfolio or personal website'), portfolioUrl);
  await pressNearestTouchTarget(getByText('Continue'));

  await waitFor(() => expect(getByText('Verification')).toBeTruthy());
  await uploadKycDocument(getByText);
  fireEvent.changeText(
    getByPlaceholderText('Share your journey - how you prepared, challenges you faced, and advice for others...'),
    bio,
  );
  fireEvent.changeText(getByPlaceholderText('Twitter, YouTube, etc. (comma separated)'), socialLinks);
  await pressNearestTouchTarget(getByText('Continue'));

  await waitFor(() => expect(getByText('Review Application')).toBeTruthy());
}

describe('mobile creator apply flow', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockInsert.mockClear();
    mockUpdateEq.mockClear();
    mockLaunchImageLibraryAsync.mockReset();
    mockStorageUpload.mockClear();
    mockGetPublicUrl.mockClear();
    mockSupabase.from.mockClear();
    mockSupabase.storage.from.mockClear();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'creator_applications') {
        return { insert: (...args: unknown[]) => mockInsert(...args) };
      }

      if (table === 'profiles') {
        return { update: () => ({ eq: (...args: unknown[]) => mockUpdateEq(...args) }) };
      }

      return {};
    });
    mockSupabase.storage.from.mockImplementation(() => ({
      upload: (...args: unknown[]) => mockStorageUpload(...args),
      getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
    }));
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///kyc.jpg', mimeType: 'image/jpeg' }],
    });
    mockUserState = {
      user: {
        id: 'creator-user-1',
        fullName: 'Amina Creator',
        imageUrl: null,
        primaryEmailAddress: { emailAddress: 'amina.creator@example.com' },
      },
    };
  });

  it('keeps the wizard gated until motivation, achievement, and verification requirements are satisfied', async () => {
    const { getByText, getByPlaceholderText } = render(<CreatorApplyScreen />);

    expect(getByText('Continue')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Continue'));
    await waitFor(() => expect(getByText('What motivates you?')).toBeTruthy());
    expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(true);

    await pressNearestTouchTarget(getByText('I want to give back to the community'));
    await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));

    await pressNearestTouchTarget(getByText('Continue'));
    await waitFor(() => expect(getByText('Your Achievement')).toBeTruthy());
    expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(true);

    await pressNearestTouchTarget(getByText('Scholarship'));
    fireEvent.changeText(getByPlaceholderText('e.g., Mastercard Foundation Scholarship 2024'), 'Mastercard Foundation Scholarship 2024');
    fireEvent.changeText(getByPlaceholderText('https://linkedin.com/in/yourprofile'), 'https://linkedin.com/in/amina');
    await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));

    await pressNearestTouchTarget(getByText('Continue'));
    await waitFor(() => expect(getByText('Verification')).toBeTruthy());
    expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(true);

    await uploadKycDocument(getByText);
    fireEvent.changeText(
      getByPlaceholderText('Share your journey - how you prepared, challenges you faced, and advice for others...'),
      'Creator bio',
    );
    await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));
  });

  it('shows the review summary with the selected creator application details', async () => {
    const { getByText, getByPlaceholderText } = render(<CreatorApplyScreen />);

    await fillApplicationToReview({
      getByText,
      getByPlaceholderText,
      motivation: 'I believe in paying it forward',
      opportunityType: 'Accelerator/Program',
      opportunityTitle: 'Google Africa Scholarship',
      linkedinUrl: 'https://linkedin.com/in/amina',
      portfolioUrl: 'https://portfolio.example.com',
      bio: 'Creator bio',
      socialLinks: 'Twitter, YouTube',
    });

    expect(getByText('Review Application')).toBeTruthy();
    expect(getByText('I believe in paying it forward')).toBeTruthy();
    expect(getByText('Accelerator/Program')).toBeTruthy();
    expect(getByText('Google Africa Scholarship')).toBeTruthy();
    expect(getByText('Document uploaded')).toBeTruthy();
    expect(getByText('Creator bio')).toBeTruthy();
  });

  it('submits the creator application, updates creator status, and returns to profile', async () => {
    const { getByText, getByPlaceholderText } = render(<CreatorApplyScreen />);

    await fillApplicationToReview({
      getByText,
      getByPlaceholderText,
      motivation: 'I want to help others achieve what I achieved',
      opportunityType: 'Scholarship',
      opportunityTitle: 'Mastercard Foundation Scholarship 2024',
      linkedinUrl: 'https://linkedin.com/in/amina',
      portfolioUrl: 'https://portfolio.example.com',
      bio: 'Creator bio',
      socialLinks: 'Twitter, YouTube',
    });

    await pressNearestTouchTarget(getByText('Submit Application'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockSupabase.from).toHaveBeenCalledWith('creator_applications');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'safe-creator-user-1',
      motivation: 'I want to help others achieve what I achieved',
      opportunity_type: 'scholarship',
      opportunity_title: 'Mastercard Foundation Scholarship 2024',
      linkedin_url: 'https://linkedin.com/in/amina',
      portfolio_url: 'https://portfolio.example.com',
      bio: 'Creator bio',
      social_links: 'Twitter, YouTube',
      kyc_image_url: 'https://files.example.com/kyc.jpg',
      status: 'pending',
    }));
    expect(mockUpdateEq).toHaveBeenCalledWith('user_id', 'safe-creator-user-1');
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('creator-applications');

    await waitFor(() => expect(getByText('Welcome to the Creator Community!')).toBeTruthy());
    await pressNearestTouchTarget(getByText('Back to Profile'));
    expect(mockReplace).toHaveBeenCalledWith('/profile');
  });
});
