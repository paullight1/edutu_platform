import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

type InsertPayload = Record<string, any>;

const mockInsertPayloads: InsertPayload[] = [];
const mockAlert = jest.spyOn(Alert, 'alert');
const mockPush = jest.fn();
const mockBack = jest.fn();

const mockSupabase = {
  from: jest.fn(),
  storage: {
    from: jest.fn(),
  },
};

function makeBuilder(table: string) {
  const state: { op: 'select' | 'insert'; payload?: any } = { op: 'select' };

  const builder: any = {
    select: () => {
      state.op = 'select';
      return builder;
    },
    order: () => builder,
    insert: (payload: any) => {
      state.op = 'insert';
      state.payload = payload;
      if (table === 'community_stories') {
        mockInsertPayloads.push(payload);
      }
      return builder;
    },
    then: (resolve: any, reject: any) => {
      Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
    catch: (reject: any) => Promise.resolve({ data: null, error: null }).catch(reject),
  };

  return builder;
}

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: {
      id: 'admin-user',
      fullName: 'Admin User',
      imageUrl: 'https://example.com/avatar.png',
      primaryEmailAddress: { emailAddress: 'admin@example.com' },
    },
    isLoaded: true,
  }),
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
      muted: '#64748B',
    },
  }),
}));

jest.mock('../components/auth/AdminGuard', () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, showBack, onBack }: { title: string; showBack?: boolean; onBack?: () => void }) => {
    const React = require('react');
    const { Text, TouchableOpacity, View } = require('react-native');
    return (
      <View>
        {showBack ? (
          <TouchableOpacity onPress={onBack}>
            <Text>Back</Text>
          </TouchableOpacity>
        ) : null}
        <Text>{title}</Text>
      </View>
    );
  },
}));

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

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

const CreateRoadmapScreen = require('../app/admin/roadmap/create').default;

function pressNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }

  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }

  act(() => {
    current.props.onPress?.();
  });
}

function pressFirstPressable(nodes: any[]) {
  for (const node of nodes) {
    try {
      pressNearestTouchTarget(node);
      return;
    } catch {
      // Continue until we find the actual interactive node.
    }
  }

  throw new Error('Could not find a pressable ancestor for the matching text nodes');
}

describe('Admin roadmap create screen', () => {
  beforeEach(() => {
    mockSupabase.from.mockClear();
    mockSupabase.storage.from.mockClear();
    mockInsertPayloads.length = 0;
    mockAlert.mockClear();
    mockPush.mockClear();
    mockBack.mockClear();
    mockSupabase.from.mockImplementation((table: string) => makeBuilder(table));
  });

  it('blocks submission until the required roadmap fields are present', async () => {
    const { getAllByText } = render(<CreateRoadmapScreen />);

    await waitFor(() => expect(getAllByText('Create Roadmap').length).toBeGreaterThan(0));
    pressFirstPressable(getAllByText('Create Roadmap'));

    expect(mockAlert).toHaveBeenCalledWith(
      'Error',
      'Please fill in title, summary, and at least one stage',
    );
  });

  it('builds a roadmap payload and routes back after a successful publish', async () => {
    const { getAllByText, getByPlaceholderText, getByText } = render(<CreateRoadmapScreen />);

    await waitFor(() => expect(getAllByText('Create Roadmap').length).toBeGreaterThan(0));

    fireEvent.changeText(getByPlaceholderText('e.g., Complete Web Development Bootcamp'), 'Complete AI Career Path');
    fireEvent.changeText(getByPlaceholderText('Brief description of this roadmap...'), 'A guided path for AI-ready students.');
    fireEvent.changeText(getByPlaceholderText('e.g., 3 months'), '6 months');
    fireEvent.changeText(getByPlaceholderText('e.g., javascript, react, web development'), 'ai, careers');
    fireEvent.changeText(
      getByPlaceholderText(/Build full-stack applications/),
      'Build practical projects\nPrepare for interviews',
    );

    pressNearestTouchTarget(getAllByText('Plus')[1]);
    await waitFor(() => expect(getByPlaceholderText('Stage 1 Title')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Stage 1 Title'), 'Foundations');
    fireEvent.changeText(getByPlaceholderText('Stage Description'), 'Learn the basics of the path.');
    fireEvent.changeText(getByPlaceholderText('Duration (e.g., 2 weeks)'), '2 weeks');
    fireEvent.changeText(getByPlaceholderText('Milestone'), 'Ready to build');
    fireEvent.changeText(getByPlaceholderText('Checkpoint / Deliverable'), 'Ship a starter project');

    pressNearestTouchTarget(getByText('Add Task'));
    fireEvent.changeText(getByPlaceholderText('Task Title'), 'Complete the starter project');
    fireEvent.changeText(getByPlaceholderText('Task Description'), 'Apply the fundamentals in a small build.');
    fireEvent.changeText(getByPlaceholderText('Duration'), '3 days');
    fireEvent.changeText(getByPlaceholderText('Expected Outcome'), 'A published starter project');

    await act(async () => {
      pressFirstPressable(getAllByText('Create Roadmap'));
    });

    await waitFor(() =>
      expect(mockInsertPayloads).toContainEqual(
        expect.objectContaining({
          title: 'Complete AI Career Path',
          summary: 'A guided path for AI-ready students.',
          duration: '6 months',
          tags: ['ai', 'careers'],
          outcomes: ['Build practical projects', 'Prepare for interviews'],
          image: null,
          resources: [],
          roadmap: [
            expect.objectContaining({
              title: 'Foundations',
              checkpoint: 'Ship a starter project',
              order: 0,
              tasks: [
                expect.objectContaining({
                  title: 'Complete the starter project',
                  outcome: 'A published starter project',
                }),
              ],
            }),
          ],
          creator: expect.objectContaining({
            name: 'Admin User',
            email: 'admin@example.com',
            verified: true,
          }),
          type: 'roadmap',
          status: 'approved',
        }),
      ),
    );

    const successAlert = mockAlert.mock.calls[mockAlert.mock.calls.length - 1];
    const okButton = successAlert[2][0];

    await act(async () => {
      okButton.onPress?.();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      'Success',
      'Roadmap created successfully!',
      expect.any(Array),
    );
    expect(mockPush).toHaveBeenCalledWith('/roadmaps');
  });
});
