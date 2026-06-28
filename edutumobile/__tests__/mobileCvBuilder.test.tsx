import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Image } from 'react-native';

type CVTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  structure_json: Record<string, unknown>;
  is_premium: boolean;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
};

type UserCV = {
  id: string;
  user_id: string;
  template_id: string | null;
  name: string;
  data_json: Record<string, any>;
  is_primary: boolean;
  match_score: number;
  target_opportunity_id?: string;
  created_at: string;
  updated_at: string;
};

type Opportunity = {
  id: string;
  title: string;
  organization: string;
  category: string;
  matchReasons?: string[];
};

const mockPush = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert');
const mockImagePrefetch = jest.spyOn(Image, 'prefetch').mockResolvedValue(undefined as never);
const mockUserState = {
  user: { id: 'user-1', fullName: 'Amina Okafor' },
  isLoaded: true,
};

const mockFetchCVTemplates = jest.fn();
const mockFetchUserCVs = jest.fn();
const mockGetUserProStatus = jest.fn();
const mockCreateUserCV = jest.fn();
const mockUpdateUserCV = jest.fn();
const mockDeleteUserCV = jest.fn();
const mockShareCV = jest.fn();
const mockGenerateAICVDraft = jest.fn();
const mockTailorCVForOpportunity = jest.fn();
const mockUseCVTrial = jest.fn();
const mockFetchOpportunities = jest.fn();

let mockTemplates: CVTemplate[] = [];
let mockUserCVs: UserCV[] = [];
let mockProStatus = { isPro: false, cvTrialUsed: false };
let mockOpportunities: Opportunity[] = [];

const mockSupabase = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
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
      primary: '#2563EB',
      accent: '#2563EB',
    },
  }),
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, showBack, right }: { title: string; showBack?: boolean; right?: React.ReactNode }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {right}
      </View>
    );
  },
}));

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label || 'Loading'}</Text>;
  },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('@edutu/core/src/services/opportunities', () => ({
  fetchOpportunities: (...args: unknown[]) => mockFetchOpportunities(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/services/cv', () => ({
  fetchCVTemplates: (...args: unknown[]) => mockFetchCVTemplates(...args),
  fetchUserCVs: (...args: unknown[]) => mockFetchUserCVs(...args),
  getUserProStatus: (...args: unknown[]) => mockGetUserProStatus(...args),
  createUserCV: (...args: unknown[]) => mockCreateUserCV(...args),
  updateUserCV: (...args: unknown[]) => mockUpdateUserCV(...args),
  deleteUserCV: (...args: unknown[]) => mockDeleteUserCV(...args),
  shareCV: (...args: unknown[]) => mockShareCV(...args),
  generateAICVDraft: (...args: unknown[]) => mockGenerateAICVDraft(...args),
  tailorCVForOpportunity: (...args: unknown[]) => mockTailorCVForOpportunity(...args),
  useCVTrial: (...args: unknown[]) => mockUseCVTrial(...args),
}), { virtual: true });

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') {
          return () => <Text>{prop}</Text>;
        }
        return undefined;
      },
    },
  );
});

const CVBuilderScreen = require('../app/(app)/cv/index').default;

function findTouchable(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }
  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }
  return current;
}

function pressByText(getByText: (text: string) => any, label: string) {
  act(() => {
    findTouchable(getByText(label)).props.onPress?.();
  });
}

describe('mobile CV builder', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAlert.mockClear();
    mockImagePrefetch.mockClear();
    mockFetchCVTemplates.mockReset().mockImplementation(() => Promise.resolve(mockTemplates));
    mockFetchUserCVs.mockReset().mockImplementation(() => Promise.resolve(mockUserCVs));
    mockGetUserProStatus.mockReset().mockImplementation(() => Promise.resolve(mockProStatus));
    mockCreateUserCV.mockReset().mockResolvedValue({ id: 'cv-new', user_id: 'user-1' });
    mockUpdateUserCV.mockReset().mockResolvedValue({ id: 'cv-1' });
    mockDeleteUserCV.mockReset().mockResolvedValue(undefined);
    mockShareCV.mockReset().mockResolvedValue(undefined);
    mockGenerateAICVDraft.mockReset().mockResolvedValue({
      header: { full_name: 'Amina Okafor', email: 'amina@example.com', phone: '', location: 'Lagos', linkedin: 'https://linkedin.com/in/amina' },
      summary: 'Draft summary',
      experience: [],
      education: [],
      skills: ['Research', 'Writing'],
      projects: [],
      achievements: [],
      research: [],
      publications: [],
      references: [],
      transactions: [],
    });
    mockTailorCVForOpportunity.mockReset().mockResolvedValue({
      tailored_cv: {
        header: { full_name: 'Amina Okafor', email: 'amina@example.com', phone: '', location: 'Lagos', linkedin: '' },
        summary: 'Tailored summary',
        experience: [],
        education: [],
        skills: ['Research'],
        projects: [],
        achievements: [],
        research: [],
        publications: [],
        references: [],
        transactions: [],
      },
      match_score: 82,
      improvements: ['Tailored summary toward the opportunity.'],
      matched_keywords: ['research'],
      missing_keywords: ['leadership'],
    });
    mockUseCVTrial.mockReset().mockResolvedValue(true);
    mockFetchOpportunities.mockReset().mockImplementation(() => Promise.resolve(mockOpportunities));

    mockTemplates = [];
    mockUserCVs = [];
    mockProStatus = { isPro: false, cvTrialUsed: false };
    mockOpportunities = [];
  });

  it('creates a CV from a free template, then saves and shares it', async () => {
    mockTemplates = [
      {
        id: 't-free',
        name: 'Modern Professional',
        category: 'Professional',
        description: 'Free template',
        structure_json: {},
        is_premium: false,
        thumbnail_url: null,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
      },
      {
        id: 't-premium',
        name: 'Premium Scholar',
        category: 'Academic',
        description: 'Premium template',
        structure_json: {},
        is_premium: true,
        thumbnail_url: null,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
      },
    ];

    const { getByText } = render(<CVBuilderScreen />);

    await waitFor(() => expect(getByText('Modern Professional')).toBeTruthy());
    pressByText(getByText, 'Modern Professional');

    pressByText(getByText, 'Use Template');
    await waitFor(() => expect(getByText('Save CV')).toBeTruthy());

    pressByText(getByText, 'Save CV');
    await waitFor(() =>
      expect(mockCreateUserCV).toHaveBeenCalledWith(
        mockSupabase,
        'user-1',
        expect.objectContaining({
          name: 'My CV',
          template_id: 't-free',
        }),
      ),
    );

    pressByText(getByText, 'Share CV');
    expect(mockShareCV).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 't-free',
        name: 'My CV',
      }),
    );
  });

  it('edits an existing CV and persists the update payload', async () => {
    mockTemplates = [
      {
        id: 't-free',
        name: 'Modern Professional',
        category: 'Professional',
        description: 'Free template',
        structure_json: {},
        is_premium: false,
        thumbnail_url: null,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
      },
    ];
    mockUserCVs = [
      {
        id: 'cv-1',
        user_id: 'user-1',
        template_id: 't-free',
        name: 'Draft CV',
        data_json: {
          header: {
            full_name: 'Amina Okafor',
            email: 'amina@example.com',
            phone: '',
            location: 'Lagos',
            linkedin: '',
            portfolio: '',
            website: '',
          },
          summary: '',
          experience: [],
          education: [],
          skills: [],
          projects: [],
          achievements: [],
          research: [],
          publications: [],
          references: [],
          transactions: [],
        },
        is_primary: true,
        match_score: 0,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
      },
    ];

    const { getByDisplayValue, getByText } = render(<CVBuilderScreen />);

    await waitFor(() => expect(getByText('Draft CV')).toBeTruthy());
    pressByText(getByText, 'Draft CV');
    await waitFor(() => expect(getByText('Save CV')).toBeTruthy());

    fireEvent.changeText(getByDisplayValue('Draft CV'), 'Scholarship CV');
    pressByText(getByText, 'Save CV');

    await waitFor(() =>
      expect(mockUpdateUserCV).toHaveBeenCalledWith(
        mockSupabase,
        'cv-1',
        expect.objectContaining({
          id: 'cv-1',
          name: 'Scholarship CV',
        }),
      ),
    );
  });

  it('unlocks premium templates, activates the trial, and generates a draft from LinkedIn', async () => {
    mockTemplates = [
      {
        id: 't-free',
        name: 'Modern Professional',
        category: 'Professional',
        description: 'Free template',
        structure_json: {},
        is_premium: false,
        thumbnail_url: null,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
      },
      {
        id: 't-premium',
        name: 'Premium Scholar',
        category: 'Academic',
        description: 'Premium template',
        structure_json: {},
        is_premium: true,
        thumbnail_url: null,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
      },
    ];

    const { getByPlaceholderText, getByText } = render(<CVBuilderScreen />);

    await waitFor(() => expect(getByText('Build faster')).toBeTruthy());
    pressByText(getByText, 'Premium Scholar');
    expect(getByText('Unlock Template')).toBeTruthy();

    pressByText(getByText, 'Unlock Template');
    await waitFor(() => expect(getByText('Unlock Premium Scholar template')).toBeTruthy());

    pressByText(getByText, 'Try Free for 7 Days');
    await waitFor(() => expect(mockUseCVTrial).toHaveBeenCalledWith(mockSupabase, 'user-1'));
    expect(mockAlert).toHaveBeenCalledWith(
      'Trial Activated',
      'You now have access to Pro features for 7 days!',
    );

    pressByText(getByText, 'Import from LinkedIn');
    fireEvent.changeText(
      getByPlaceholderText('https://linkedin.com/in/username'),
      'https://linkedin.com/in/amina',
    );
    pressByText(getByText, 'Generate CV');

    await waitFor(() =>
      expect(mockGenerateAICVDraft).toHaveBeenCalledWith(
        mockSupabase,
        'user-1',
        expect.objectContaining({
          linkedInUrl: 'https://linkedin.com/in/amina',
          prompt: 'scholarships, internships, and early-career opportunities',
        }),
      ),
    );
    await waitFor(() => expect(getByText('Save CV')).toBeTruthy());
    expect(mockAlert).toHaveBeenCalledWith(
      'Success',
      'Your CV draft has been generated from your profile context.',
    );
  });

  it('opens the tailoring modal and applies a selected opportunity', async () => {
    mockTemplates = [
      {
        id: 't-free',
        name: 'Modern Professional',
        category: 'Professional',
        description: 'Free template',
        structure_json: {},
        is_premium: false,
        thumbnail_url: null,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
      },
    ];
    mockOpportunities = [
      {
        id: 'opp-1',
        title: 'Mastercard Scholarship',
        organization: 'Mastercard Foundation',
        category: 'Scholarship',
        matchReasons: ['Strong education and service fit'],
      },
    ];

    const { getByText } = render(<CVBuilderScreen />);

    await waitFor(() => expect(getByText('Build faster')).toBeTruthy());
    pressByText(getByText, 'Tailor to an opportunity');

    await waitFor(() => expect(getByText('AI CV Tailoring')).toBeTruthy());
    pressByText(getByText, 'Mastercard Scholarship');

    await waitFor(() =>
      expect(mockTailorCVForOpportunity).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({
          userId: 'user-1',
          opportunityId: 'opp-1',
          currentCVData: {},
        }),
      ),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      'CV Tailored',
      'Tailored summary toward the opportunity.',
    );
  });
});
