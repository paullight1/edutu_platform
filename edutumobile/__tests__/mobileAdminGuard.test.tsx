import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

let mockUserState: { user: any; isLoaded: boolean } = {
  user: null,
  isLoaded: true,
};

const mockIsAdminUser = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => mockUserState,
}));

jest.mock('../lib/auth', () => ({
  isAdminUser: (...args: unknown[]) => mockIsAdminUser(...args),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {},
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      primary: '#2563EB',
    },
  }),
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

const { AdminGuard } = require('../components/auth/AdminGuard');

describe('AdminGuard', () => {
  beforeEach(() => {
    mockUserState = {
      user: null,
      isLoaded: true,
    };
    mockIsAdminUser.mockReset();
  });

  it('keeps showing the loading state until auth is ready', () => {
    mockUserState = {
      user: null,
      isLoaded: false,
    };

    const { queryByText } = render(
      <AdminGuard>
        <Text>Secret Admin Content</Text>
      </AdminGuard>,
    );

    expect(queryByText('Secret Admin Content')).toBeNull();
    expect(queryByText('redirect:/profile')).toBeNull();
    expect(mockIsAdminUser).not.toHaveBeenCalled();
  });

  it('redirects anonymous users back to the profile screen', async () => {
    mockUserState = {
      user: null,
      isLoaded: true,
    };

    const { getByText, queryByText } = render(
      <AdminGuard>
        <Text>Secret Admin Content</Text>
      </AdminGuard>,
    );

    await waitFor(() => expect(getByText('redirect:/profile')).toBeTruthy());
    expect(queryByText('Secret Admin Content')).toBeNull();
    expect(mockIsAdminUser).not.toHaveBeenCalled();
  });

  it('renders admin content when the role lookup succeeds', async () => {
    mockUserState = {
      user: { id: 'user-1' },
      isLoaded: true,
    };
    mockIsAdminUser.mockResolvedValue(true);

    const { getByText, queryByText } = render(
      <AdminGuard>
        <Text>Secret Admin Content</Text>
      </AdminGuard>,
    );

    await waitFor(() => expect(getByText('Secret Admin Content')).toBeTruthy());
    expect(queryByText('redirect:/profile')).toBeNull();
    expect(mockIsAdminUser).toHaveBeenCalledWith({}, 'user-1');
  });
});
