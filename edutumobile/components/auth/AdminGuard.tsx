import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { supabase } from '../../lib/supabase';
import { isAdminUser } from '../../lib/auth';
import { useTheme } from '../context/ThemeContext';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { user, isLoaded } = useUser();
  const { colors } = useTheme();
  const [isChecking, setIsChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkRole() {
      if (!isLoaded) return;
      if (!user?.id) {
        if (isMounted) {
          setIsAdmin(false);
          setIsChecking(false);
        }
        return;
      }

      try {
        const allowed = await isAdminUser(supabase, user.id);
        if (isMounted) setIsAdmin(allowed);
      } catch (error) {
        if (__DEV__) console.error('Failed to verify admin role:', error);
        if (isMounted) setIsAdmin(false);
      } finally {
        if (isMounted) setIsChecking(false);
      }
    }

    checkRole();
    return () => {
      isMounted = false;
    };
  }, [isLoaded, user?.id]);

  if (!isLoaded || isChecking) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!isAdmin) {
    return <Redirect href="/profile" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
