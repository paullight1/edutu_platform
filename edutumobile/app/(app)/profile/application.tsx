import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../components/context/ThemeContext';
import { ApplicantBackground } from '../../../components/opportunity/ApplicantBackground';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';

export default function ApplicationProfileScreen() {
  const { colors } = useTheme();

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Application profile" showBack />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ color: colors.textSecondary }}>
          Edutu uses these details when you start Auto Apply. Changes apply to applications you start after saving.
        </Text>
        <ApplicantBackground initiallyOpen />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
