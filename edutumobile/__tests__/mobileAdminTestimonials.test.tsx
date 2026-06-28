import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

type Testimonial = {
  id: string;
  name: string;
  role: string;
  country: string;
  avatar_url: string;
  rating: number;
  review_text: string;
  video_url: string;
  youtube_id: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

const mockTestimonials: Testimonial[] = [
  {
    id: 'test-1',
    name: 'Amina Okafor',
    role: 'Scholarship recipient',
    country: 'Nigeria',
    avatar_url: '',
    rating: 5,
    review_text: 'Edutu helped me find the right scholarship in one place.',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    is_active: true,
    sort_order: 0,
    created_at: '2026-06-22T08:00:00.000Z',
  },
  {
    id: 'test-2',
    name: 'Musa Bello',
    role: 'Mentor',
    country: 'Ghana',
    avatar_url: '',
    rating: 4,
    review_text: 'The mobile workflow is smooth and reliable.',
    video_url: '',
    youtube_id: '',
    is_active: false,
    sort_order: 1,
    created_at: '2026-06-21T08:00:00.000Z',
  },
];

const mockMutations: Array<{ op: string; payload?: any; id?: string }> = [];
const mockAlert = jest.spyOn(Alert, 'alert');

const mockSupabase = {
  from: jest.fn(),
};

function makeBuilder(table: string) {
  const state: {
    op: 'select' | 'insert' | 'update' | 'delete';
    payload?: any;
    where?: { field: string; value: string };
  } = {
    op: 'select',
  };

  const builder: any = {
    select: () => {
      state.op = 'select';
      return builder;
    },
    order: () => builder,
    insert: (payload: any) => {
      state.op = 'insert';
      state.payload = payload;
      if (table === 'testimonials') {
        mockMutations.push({ op: 'testimonials.insert', payload });
      }
      return builder;
    },
    update: (payload: any) => {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    delete: () => {
      state.op = 'delete';
      return builder;
    },
    eq: (field: string, value: string) => {
      state.where = { field, value };
      if (state.op !== 'select') {
        mockMutations.push({ op: `${table}.${state.op}`, payload: state.payload, id: value });
      }
      return builder;
    },
    then: (resolve: any, reject: any) => {
      Promise.resolve(resolveQuery(table, state)).then(resolve, reject);
    },
    catch: (reject: any) => Promise.resolve(resolveQuery(table, state)).catch(reject),
  };

  return builder;
}

function resolveQuery(table: string, state: {
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: any;
  where?: { field: string; value: string };
}) {
  if (table === 'testimonials') {
    if (state.op === 'select') {
      return { data: mockTestimonials, error: null };
    }
    return { data: null, error: null };
  }

  return { data: null, error: null };
}

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: { id: 'admin-user', fullName: 'Admin User' },
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
    },
  }),
}));

jest.mock('../components/auth/AdminGuard', () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

jest.mock('../components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, ...props }: { children: React.ReactNode }) => {
    const React = require('react');
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity {...props}>{children}</TouchableOpacity>;
  },
}));

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
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

const AdminTestimonials = require('../app/admin/testimonials').default;

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
      // Keep scanning until we reach the actual button.
    }
  }

  throw new Error('Could not find a pressable ancestor for the matching text nodes');
}

describe('Admin testimonials screen', () => {
  beforeEach(() => {
    mockSupabase.from.mockClear();
    mockMutations.length = 0;
    mockAlert.mockClear();
    mockSupabase.from.mockImplementation((table: string) => makeBuilder(table));
  });

  it('adds and edits testimonials with YouTube extraction and validation', async () => {
    const { getAllByText, getByDisplayValue, getByPlaceholderText, getByText, getByTestId } = render(<AdminTestimonials />);

    await waitFor(() => expect(getByText('Amina Okafor')).toBeTruthy());

    pressNearestTouchTarget(getAllByText('Add Testimonial').at(-1));
    await waitFor(() => expect(getByPlaceholderText('e.g. John Doe')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('e.g. John Doe'), 'Grace Njeri');
    fireEvent.changeText(getByPlaceholderText('e.g. Software Engineer'), 'Community Mentor');
    fireEvent.changeText(getByPlaceholderText('Write the testimonial review...'), 'Edutu made the application process much easier.');
    fireEvent.changeText(
      getByPlaceholderText('https://www.youtube.com/watch?v=...'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );

    await waitFor(() => expect(getByText('Video ID: dQw4w9WgXcQ')).toBeTruthy());

    fireEvent.press(getByTestId('testimonial-modal-submit'));

    await waitFor(() =>
      expect(mockMutations).toContainEqual(
        expect.objectContaining({
          op: 'testimonials.insert',
          payload: expect.objectContaining({
            name: 'Grace Njeri',
            role: 'Community Mentor',
            review_text: 'Edutu made the application process much easier.',
            youtube_id: 'dQw4w9WgXcQ',
            is_active: true,
            sort_order: 2,
          }),
        }),
      ),
    );
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Testimonial added successfully.');

    pressNearestTouchTarget(getAllByText('Pencil')[0]);
    await waitFor(() => expect(getByText('Edit Testimonial')).toBeTruthy());

    fireEvent.changeText(getByDisplayValue('Amina Okafor'), 'Amina A.');
    fireEvent.changeText(getByDisplayValue('Scholarship recipient'), 'Scholarship graduate');
    fireEvent.changeText(
      getByPlaceholderText('https://www.youtube.com/watch?v=...'),
      'https://youtu.be/ABCDEFGHIJK',
    );

    await act(async () => {
      fireEvent.press(getByText('Update Testimonial'));
    });

    await waitFor(() =>
      expect(mockMutations).toContainEqual(
        expect.objectContaining({
          op: 'testimonials.update',
          id: 'test-1',
          payload: expect.objectContaining({
            name: 'Amina A.',
            role: 'Scholarship graduate',
            youtube_id: 'ABCDEFGHIJK',
          }),
        }),
      ),
    );
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Testimonial updated successfully.');
  });

  it('filters, toggles, and deletes testimonials with confirmation', async () => {
    const { getAllByText, getByText, queryByText } = render(<AdminTestimonials />);

    await waitFor(() => expect(getByText('Amina Okafor')).toBeTruthy());

    pressFirstPressable(getAllByText('Inactive'));
    await waitFor(() => expect(getByText('Musa Bello')).toBeTruthy());
    expect(queryByText('Amina Okafor')).toBeNull();

    pressNearestTouchTarget(getByText('ToggleLeft'));

    await waitFor(() =>
      expect(mockMutations).toContainEqual(
        expect.objectContaining({
          op: 'testimonials.update',
          id: 'test-2',
          payload: expect.objectContaining({
            is_active: true,
          }),
        }),
      ),
    );

    pressNearestTouchTarget(getAllByText('Trash2')[0]);
    const deleteAlert = mockAlert.mock.calls[mockAlert.mock.calls.length - 1];
    const deleteButton = deleteAlert[2].find((button: { style?: string }) => button.style === 'destructive');

    await act(async () => {
      deleteButton.onPress?.();
    });

    await waitFor(() =>
      expect(mockMutations).toContainEqual(
        expect.objectContaining({
          op: 'testimonials.delete',
          id: 'test-2',
        }),
      ),
    );
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Testimonial deleted.');
  });
});
