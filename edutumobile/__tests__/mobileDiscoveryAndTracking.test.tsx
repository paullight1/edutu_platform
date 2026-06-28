import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, View, TouchableOpacity } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockRefresh = jest.fn();
const mockRecordOpportunitySignal = jest.fn();
const mockSyncOpportunityWidgetSnapshot = jest.fn().mockResolvedValue(undefined);
const mockFetchTrackedApplications = jest.fn();
const mockUpdateTrackedApplicationStatus = jest.fn().mockResolvedValue(true);
const mockFetchOpportunityDeadlines = jest.fn();

let mockUserState: { user: { id: string; unsafeMetadata?: Record<string, unknown> } | null };
let mockRouteParams: Record<string, string | undefined> = {};
let mockOpportunities: Array<any> = [];
let mockApplications: Array<any> = [];
let mockDeadlines: Array<any> = [];
let mockLoading = false;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    useLocalSearchParams: () => mockRouteParams,
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = callback?.();
        return cleanup;
      }, [callback]);
    },
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
  useUser: () => mockUserState,
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      textSecondary: '#64748B',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#2563EB',
      primary: '#2563EB',
    },
    isDark: false,
  }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SvgXml: ({ xml }: { xml?: string }) => <Text>{xml ? 'SvgXml' : 'SvgXmlEmpty'}</Text>,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

jest.mock('react-native/Libraries/Animated/Animated', () => {
  const React = require('react');
  const { FlatList, View } = require('react-native');
  const AnimatedView = React.forwardRef(({ children, ...props }: any, ref: any) => (
    <View ref={ref} {...props}>
      {children}
    </View>
  ));
  const AnimatedFlatList = React.forwardRef((props: any, ref: any) => (
    <FlatList ref={ref} {...props} />
  ));
  const builder = {
    duration: () => builder,
    delay: () => builder,
    springify: () => builder,
  };
  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      Text: AnimatedView,
      FlatList: AnimatedFlatList,
      Image: AnimatedView,
      timing: () => ({ start: jest.fn(), stop: jest.fn() }),
      event: () => jest.fn(),
      Value: class {
        value: number;
        constructor(value: number) {
          this.value = value;
        }
        interpolate() {
          return 0;
        }
        setValue(value: number) {
          this.value = value;
        }
        resetAnimation() {
          this.value = 1;
        }
        stopAnimation(callback?: (value: number) => void) {
          callback?.(this.value);
        }
      },
      FadeIn: builder,
      FadeInDown: builder,
      FadeInUp: builder,
      Layout: builder,
      ZoomIn: builder,
      createAnimatedComponent: (Component: any) => Component,
    },
  };
});

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, subtitle, right, showBack }: { title: string; subtitle?: string; right?: React.ReactNode; showBack?: boolean }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
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

jest.mock('../components/ui/LottieState', () => ({
  LottieState: ({ title, description, actionLabel, onActionPress }: {
    title: string;
    description?: string;
    actionLabel?: string;
    onActionPress?: () => void;
  }) => {
    const React = require('react');
    const { Text, TouchableOpacity, View } = require('react-native');
    return (
      <View>
        <Text>{title}</Text>
        {description ? <Text>{description}</Text> : null}
        {actionLabel ? (
          <TouchableOpacity onPress={onActionPress}>
            <Text>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  },
}));

jest.mock('../components/ui/AdBanner', () => ({
  BANNER_PRESETS: {
    buildCV: {
      title: 'Build your CV',
      subtitle: 'Create a profile',
      actionLabel: 'Build CV',
    },
  },
  AdBanner: ({
    config,
    onPress,
  }: {
    config: { title: string; subtitle: string; actionLabel: string };
    onPress?: () => void;
  }) => {
    const React = require('react');
    const { Text, TouchableOpacity, View } = require('react-native');
    return (
      <View>
        <Text>{config.title}</Text>
        <Text>{config.subtitle}</Text>
        <TouchableOpacity onPress={onPress}>
          <Text>{config.actionLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

jest.mock('../lib/discoveryCategoryIcons', () => ({
  getDiscoveryCategoryIconXml: (type: string) => `<svg>${type}</svg>`,
  getDiscoveryCategoryIconSource: () => 1,
}));

jest.mock('../lib/opportunityWidgetSync', () => ({
  syncAndUpdateOpportunityWidgetSnapshot: (...args: unknown[]) => mockSyncOpportunityWidgetSnapshot(...args),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {},
}));

jest.mock('@edutu/core/src/hooks/useOpportunities', () => ({
  useOpportunities: () => ({
    data: mockOpportunities,
    loading: mockLoading,
    error: null,
    refresh: mockRefresh,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/services/opportunitySignals', () => ({
  recordOpportunitySignal: (...args: unknown[]) => mockRecordOpportunitySignal(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/services/applications', () => ({
  fetchTrackedApplications: (...args: unknown[]) => mockFetchTrackedApplications(...args),
  updateTrackedApplicationStatus: (...args: unknown[]) => mockUpdateTrackedApplicationStatus(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/services/deadlines', () => ({
  fetchOpportunityDeadlines: (...args: unknown[]) => mockFetchOpportunityDeadlines(...args),
}), { virtual: true });

jest.mock('/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/packages/core/src/services/applications', () => ({
  fetchTrackedApplications: (...args: unknown[]) => mockFetchTrackedApplications(...args),
  updateTrackedApplicationStatus: (...args: unknown[]) => mockUpdateTrackedApplicationStatus(...args),
}), { virtual: true });

jest.mock('/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/packages/core/src/services/deadlines', () => ({
  fetchOpportunityDeadlines: (...args: unknown[]) => mockFetchOpportunityDeadlines(...args),
}), { virtual: true });

const Alert = jest.requireActual('react-native').Alert as { alert: jest.Mock };
const alertSpy = jest.spyOn(Alert, 'alert');

const OpportunitiesScreen = require('../app/(app)/opportunities/index').default;
const AppliedScreen = require('../app/(app)/applied').default;
const DeadlinesScreen = require('../app/(app)/deadlines').default;

function pressNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }

  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }

  current.props.onPress?.();
}

describe('mobile discovery and tracking routes', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockGetToken.mockClear();
    mockRefresh.mockClear();
    mockRecordOpportunitySignal.mockClear();
    mockSyncOpportunityWidgetSnapshot.mockClear();
    mockFetchTrackedApplications.mockReset();
    mockUpdateTrackedApplicationStatus.mockClear();
    mockFetchOpportunityDeadlines.mockReset();
    mockUserState = { user: { id: 'user-1', unsafeMetadata: { country: 'Nigeria' } } };
    mockRouteParams = {};
    mockOpportunities = [
      {
        id: 'opp-featured',
        title: 'Global Fellowship',
        organization: 'Edutu',
        category: 'Fellowship',
        location: 'Remote',
        description: 'A featured opportunity',
        deadline: new Date(Date.now() + 18 * 86400000).toISOString(),
        image: null,
        requirements: ['Requirement 1'],
        benefits: ['Benefit 1'],
        applicationProcess: ['Step 1'],
        match: 82,
        featured: true,
      },
      {
        id: 'opp-regular',
        title: 'Campus Internship',
        organization: 'Edutu',
        category: 'Internship',
        location: 'Lagos',
        description: 'Another opportunity',
        deadline: new Date(Date.now() + 9 * 86400000).toISOString(),
        image: null,
        requirements: ['Requirement 2'],
        benefits: ['Benefit 2'],
        applicationProcess: ['Step 2'],
        match: 56,
        featured: false,
      },
    ];
    mockApplications = [];
    mockDeadlines = [];
    mockLoading = false;
    mockFetchTrackedApplications.mockResolvedValue(mockApplications);
    mockFetchOpportunityDeadlines.mockResolvedValue(mockDeadlines);
    alertSpy.mockClear();
  });

  it('renders the opportunity chooser, for-you rail, and feature shortcuts', async () => {
    const { getByText, getAllByText } = render(<OpportunitiesScreen />);

    await waitFor(() => expect(getByText('What are you looking for?')).toBeTruthy());
    expect(getByText('For you')).toBeTruthy();
    expect(getByText('Other features')).toBeTruthy();
    expect(getByText('Scholarships')).toBeTruthy();
    expect(getByText('Internships')).toBeTruthy();
    expect(getByText('Programs')).toBeTruthy();
    expect(getByText('Fellowships')).toBeTruthy();
    expect(getByText('Applied')).toBeTruthy();
    expect(getByText('Deadlines')).toBeTruthy();
    expect(getByText('Creator Studio')).toBeTruthy();
    expect(getByText('View all')).toBeTruthy();
    expect(getByText('CV Builder')).toBeTruthy();
    expect(getByText('Build CV')).toBeTruthy();

    fireEvent.press(getByText('Programs'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/opportunities', params: { category: 'grants' } });

    fireEvent.press(getByText('View all'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/opportunities', params: { view: 'foryou' } });

    fireEvent.press(getByText('CV Builder'));
    expect(mockPush).toHaveBeenCalledWith('/cv');

    expect(getAllByText('Global Fellowship').length).toBeGreaterThan(0);
    expect(getAllByText('Campus Internship').length).toBeGreaterThan(0);
  });

  it('renders the grants category hero, discovery filters, and search/settings menu actions', async () => {
    mockRouteParams = { category: 'grants' };
    mockOpportunities = [
      {
        id: 'opp-program',
        title: 'Youth Leadership Forum',
        organization: 'Edutu',
        category: 'Program',
        location: 'Abuja',
        description: 'A leadership forum',
        deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
        image: null,
        requirements: ['Requirement 1'],
        benefits: ['Benefit 1'],
        applicationProcess: ['Step 1'],
        match: 61,
        featured: true,
      },
      {
        id: 'opp-scholarship',
        title: 'Scholarship Award',
        organization: 'Edutu',
        category: 'Scholarship',
        location: 'Lagos',
        description: 'A scholarship opportunity',
        deadline: new Date(Date.now() + 8 * 86400000).toISOString(),
        image: null,
        requirements: ['Requirement 2'],
        benefits: ['Benefit 2'],
        applicationProcess: ['Step 2'],
        match: 74,
        featured: false,
      },
    ];
    mockFetchTrackedApplications.mockResolvedValue([]);
    mockFetchOpportunityDeadlines.mockResolvedValue([]);

    const { getAllByText, getByPlaceholderText, getByText, queryByText } = render(<OpportunitiesScreen />);

    await waitFor(() => expect(getAllByText('Global Programs').length).toBeGreaterThan(0));
    expect(getByText('Explore')).toBeTruthy();
    expect(getByText('Grid')).toBeTruthy();
    expect(getByText('List')).toBeTruthy();
    expect(getAllByText('3d left').length).toBeGreaterThan(0);
    expect(getByText('Youth Leadership Forum')).toBeTruthy();
    expect(queryByText('Scholarship Award')).toBeNull();

    fireEvent.press(getByText('List'));
    expect(getByText('Youth Leadership Forum')).toBeTruthy();
    expect(getByText('3d left')).toBeTruthy();

    await act(async () => {
      pressNearestTouchTarget(getAllByText('Menu')[0]);
    });
    expect(getAllByText('Search').length).toBeGreaterThan(1);
    expect(getAllByText('Settings').length).toBeGreaterThan(0);
    expect(getAllByText('Refresh').length).toBeGreaterThan(0);

    const searchMenuNode = getAllByText('Search').find((node: any) => {
      let current = node;
      while (current && !current.props?.onPress) {
        current = current.parent;
      }
      return Boolean(current?.props?.onPress);
    });

    if (!searchMenuNode) {
      throw new Error('Could not find the search menu item');
    }

    await act(async () => {
      pressNearestTouchTarget(searchMenuNode);
    });
    await waitFor(() => expect(getByPlaceholderText('Search scholarships, fellowships, jobs...')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('Search scholarships, fellowships, jobs...'), 'forum');
    expect(getByText('Youth Leadership Forum')).toBeTruthy();
    expect(queryByText('Scholarship Award')).toBeNull();

    fireEvent.press(getByText('X'));
    await act(async () => {
      pressNearestTouchTarget(getAllByText('Menu')[0]);
    });
    await act(async () => {
      const settingsMenuNode = getAllByText('Settings').find((node: any) => {
        let current = node;
        while (current && !current.props?.onPress) {
          current = current.parent;
        }
        return Boolean(current?.props?.onPress);
      });

      if (!settingsMenuNode) {
        throw new Error('Could not find the settings menu item');
      }

      pressNearestTouchTarget(settingsMenuNode);
    });
    expect(mockPush).toHaveBeenCalledWith('/profile/settings');
  });

  it('renders the browse empty state when the for-you feed has no matches', async () => {
    mockRouteParams = { view: 'foryou' };
    mockOpportunities = [];
    mockFetchTrackedApplications.mockResolvedValue([]);
    mockFetchOpportunityDeadlines.mockResolvedValue([]);

    const { getByText } = render(<OpportunitiesScreen />);

    await waitFor(() => expect(getByText('Personalized')).toBeTruthy());
    expect(getByText('No opportunities found')).toBeTruthy();
    expect(getByText('Check back later for new opportunities.')).toBeTruthy();
  });

  it('keeps the browse list usable with a larger for-you set', async () => {
    mockRouteParams = { view: 'foryou' };
    mockOpportunities = Array.from({ length: 8 }, (_, index) => ({
      id: `opp-for-you-${index + 1}`,
      title: `Personalized Opportunity ${index + 1}`,
      organization: 'Edutu',
      category: index % 2 === 0 ? 'Fellowship' : 'Scholarship',
      location: 'Remote',
      description: `Opportunity ${index + 1}`,
      deadline: new Date(Date.now() + (index + 5) * 86400000).toISOString(),
      image: null,
      requirements: ['Requirement 1'],
      benefits: ['Benefit 1'],
      applicationProcess: ['Step 1'],
      match: 90 - index,
      featured: false,
    }));
    mockFetchTrackedApplications.mockResolvedValue([]);
    mockFetchOpportunityDeadlines.mockResolvedValue([]);

    const { getByText } = render(<OpportunitiesScreen />);

    await waitFor(() => expect(getByText('Personalized')).toBeTruthy());
    expect(getByText('Grid')).toBeTruthy();
    expect(getByText('List')).toBeTruthy();

    fireEvent.press(getByText('List'));
    expect(getByText('Personalized Opportunity 8')).toBeTruthy();
  });

  it('shows grouped applications and updates status from the picker', async () => {
    mockApplications = [
      {
        id: 'app-1',
        opportunity_id: 'opp-1',
        status: 'submitted',
        submitted_at: '2026-06-22T00:00:00.000Z',
        title: 'Global Fellowship',
        organization: 'Edutu',
        deadline: new Date(Date.now() + 4 * 86400000).toISOString(),
        location: 'Remote',
        image: null,
        category: 'Fellowship',
      },
    ];
    mockFetchTrackedApplications.mockResolvedValue(mockApplications);

    const { getByText } = render(<AppliedScreen />);

    await waitFor(() => expect(getByText('My Applications')).toBeTruthy());
    expect(getByText('1 applied')).toBeTruthy();
    expect(getByText('Global Fellowship')).toBeTruthy();
    expect(getByText('Submitted')).toBeTruthy();

    pressNearestTouchTarget(getByText('Submitted'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Update application status',
      'Global Fellowship',
      expect.any(Array),
    ));

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => {
      alertButtons.find((option) => option.text === 'Interview')?.onPress?.();
    });
    expect(mockUpdateTrackedApplicationStatus).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      'app-1',
      'interview',
      mockGetToken,
    );

    fireEvent.press(getByText('Global Fellowship'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities/opp-1');
  });

  it('renders the applied empty state and routes to discovery', async () => {
    mockApplications = [];
    mockFetchTrackedApplications.mockResolvedValue([]);

    const { getByText } = render(<AppliedScreen />);

    await waitFor(() => expect(getByText('No applications yet')).toBeTruthy());
    fireEvent.press(getByText('Browse Opportunities'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities');
  });

  it('keeps the applied list usable with a larger dataset', async () => {
    mockApplications = Array.from({ length: 8 }, (_, index) => ({
      id: `app-${index + 1}`,
      opportunity_id: `opp-${index + 1}`,
      status: 'submitted',
      submitted_at: new Date(Date.now() - index * 86400000).toISOString(),
      title: `Global Fellowship ${index + 1}`,
      organization: 'Edutu',
      deadline: new Date(Date.now() + (index + 4) * 86400000).toISOString(),
      location: 'Remote',
      image: null,
      category: 'Fellowship',
    }));
    mockFetchTrackedApplications.mockResolvedValue(mockApplications);

    const { getByText, getAllByText } = render(<AppliedScreen />);

    await waitFor(() => expect(getByText('My Applications')).toBeTruthy());
    expect(getByText('8 applied')).toBeTruthy();
    expect(getByText('Global Fellowship 8')).toBeTruthy();
    expect(getAllByText('Submitted').length).toBe(8);
  });

  it('groups deadlines and opens opportunity details from the list', async () => {
    mockDeadlines = [
      {
        id: 'dl-1',
        opportunityId: 'opp-1',
        title: 'Global Fellowship',
        organization: 'Edutu',
        daysRemaining: 3,
        type: 'applied',
        deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
      },
      {
        id: 'dl-2',
        opportunityId: 'opp-2',
        title: 'Campus Internship',
        organization: 'Edutu',
        daysRemaining: 20,
        type: 'bookmarked',
        deadline: new Date(Date.now() + 20 * 86400000).toISOString(),
      },
    ];
    mockFetchOpportunityDeadlines.mockResolvedValue(mockDeadlines);

    const { getByText } = render(<DeadlinesScreen />);

    await waitFor(() => expect(getByText('Deadlines')).toBeTruthy());
    expect(getByText('This Week')).toBeTruthy();
    expect(getByText('This Month')).toBeTruthy();
    expect(getByText('Global Fellowship')).toBeTruthy();
    expect(getByText('Campus Internship')).toBeTruthy();

    fireEvent.press(getByText('Global Fellowship'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities/opp-1');
  });

  it('renders the deadlines empty state and routes to discovery', async () => {
    mockDeadlines = [];
    mockFetchOpportunityDeadlines.mockResolvedValue([]);

    const { getByText } = render(<DeadlinesScreen />);

    await waitFor(() => expect(getByText('No Deadlines Yet')).toBeTruthy());
    fireEvent.press(getByText('Browse Opportunities'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities');
  });

  it('shows all deadline buckets when the list spans the full range', async () => {
    mockDeadlines = [
      {
        id: 'dl-1',
        opportunityId: 'opp-1',
        title: 'Global Fellowship',
        organization: 'Edutu',
        daysRemaining: 2,
        type: 'applied',
        deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
      {
        id: 'dl-2',
        opportunityId: 'opp-2',
        title: 'Campus Internship',
        organization: 'Edutu',
        daysRemaining: 9,
        type: 'bookmarked',
        deadline: new Date(Date.now() + 9 * 86400000).toISOString(),
      },
      {
        id: 'dl-3',
        opportunityId: 'opp-3',
        title: 'Leadership Program',
        organization: 'Edutu',
        daysRemaining: 21,
        type: 'bookmarked',
        deadline: new Date(Date.now() + 21 * 86400000).toISOString(),
      },
      {
        id: 'dl-4',
        opportunityId: 'opp-4',
        title: 'Future Accelerator',
        organization: 'Edutu',
        daysRemaining: 45,
        type: 'bookmarked',
        deadline: new Date(Date.now() + 45 * 86400000).toISOString(),
      },
    ];
    mockFetchOpportunityDeadlines.mockResolvedValue(mockDeadlines);

    const { getByText } = render(<DeadlinesScreen />);

    await waitFor(() => expect(getByText('Deadlines')).toBeTruthy());
    expect(getByText('This Week')).toBeTruthy();
    expect(getByText('Next Week')).toBeTruthy();
    expect(getByText('This Month')).toBeTruthy();
    expect(getByText('Later')).toBeTruthy();
    expect(getByText('Future Accelerator')).toBeTruthy();

    fireEvent.press(getByText('Future Accelerator'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities/opp-4');
  });
});
