import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.useFakeTimers();

const mockSendTranscript = jest.fn();
const mockClose = jest.fn();
const mockStartRecording = jest.fn();
const mockStopRecording = jest.fn();
const mockReset = jest.fn();

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
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

const VoiceRecordingModal = require('../components/chat/VoiceRecordingModal').default;

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

describe('VoiceRecordingModal', () => {
  beforeEach(() => {
    mockSendTranscript.mockClear();
    mockClose.mockClear();
    mockStartRecording.mockClear();
    mockStopRecording.mockClear();
    mockReset.mockClear();
    jest.clearAllTimers();
  });

  it('starts and stops recording, sends a transcript manually, and resets on close', () => {
    const { getByText, rerender } = render(
      <VoiceRecordingModal
        visible
        isDark={false}
        onSendTranscript={mockSendTranscript}
        onClose={mockClose}
        recordingState="idle"
        duration={0}
        transcript={null}
        error={null}
        onStartRecording={mockStartRecording}
        onStopRecording={mockStopRecording}
        onReset={mockReset}
      />,
    );

    expect(getByText('Tap to Speak')).toBeTruthy();
    expect(getByText('Tap microphone to start recording')).toBeTruthy();

    pressByText(getByText, 'Mic');
    expect(mockStartRecording).toHaveBeenCalledTimes(1);

    rerender(
      <VoiceRecordingModal
        visible
        isDark={false}
        onSendTranscript={mockSendTranscript}
        onClose={mockClose}
        recordingState="recording"
        duration={65}
        transcript={null}
        error={null}
        onStartRecording={mockStartRecording}
        onStopRecording={mockStopRecording}
        onReset={mockReset}
      />,
    );

    expect(getByText('Listening...')).toBeTruthy();
    expect(getByText('01:05')).toBeTruthy();
    expect(getByText('Tap microphone to stop')).toBeTruthy();

    pressByText(getByText, 'Mic');
    expect(mockStopRecording).toHaveBeenCalledTimes(1);

    rerender(
      <VoiceRecordingModal
        visible
        isDark={false}
        onSendTranscript={mockSendTranscript}
        onClose={mockClose}
        recordingState="idle"
        duration={0}
        transcript="Hello Edutu"
        error={null}
        onStartRecording={mockStartRecording}
        onStopRecording={mockStopRecording}
        onReset={mockReset}
      />,
    );

    expect(getByText('Voice Message')).toBeTruthy();
    expect(getByText('Tap send or wait')).toBeTruthy();
    expect(getByText('Send')).toBeTruthy();

    pressByText(getByText, 'Send');
    expect(mockSendTranscript).toHaveBeenCalledWith('Hello Edutu');

    pressByText(getByText, 'X');
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('auto-sends a transcript after the delay when recording has stopped', async () => {
    render(
      <VoiceRecordingModal
        visible
        isDark={true}
        onSendTranscript={mockSendTranscript}
        onClose={mockClose}
        recordingState="idle"
        duration={0}
        transcript="Please find scholarships"
        error={null}
        onStartRecording={mockStartRecording}
        onStopRecording={mockStopRecording}
        onReset={mockReset}
      />,
    );

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() =>
      expect(mockSendTranscript).toHaveBeenCalledWith('Please find scholarships'),
    );
  });

  it('renders the error state and allows restarting recording', () => {
    const { getByText } = render(
      <VoiceRecordingModal
        visible
        isDark={false}
        onSendTranscript={mockSendTranscript}
        onClose={mockClose}
        recordingState="error"
        duration={0}
        transcript={null}
        error="Microphone permission was denied"
        onStartRecording={mockStartRecording}
        onStopRecording={mockStopRecording}
        onReset={mockReset}
      />,
    );

    expect(getByText('Microphone permission was denied')).toBeTruthy();
    pressByText(getByText, 'Mic');
    expect(mockStartRecording).toHaveBeenCalledTimes(1);
  });
});
