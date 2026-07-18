import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useAuth } from '@clerk/clerk-expo';
import {
  uploadDocument,
  type UploadKind,
} from '@edutu/core/src/services/uploads';
import { useTheme } from '../context/ThemeContext';

const ACCEPTED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

type UploadState = 'idle' | 'uploading' | 'parsing' | 'done' | 'error';

type DocumentUploadProps = {
  kind?: UploadKind;
  opportunityId?: string;
  label?: string;
  /** Called with the upload id once parsing finishes, so the caller can attach it. */
  onUploaded?: (uploadId: string) => void;
};

/**
 * Lets the user attach a real document (CV, transcript, essay). Picks a file,
 * uploads it, triggers parsing, and reports the parsed upload id so the coach
 * can read it. Self-contained — screens just drop it in.
 */
export function DocumentUpload({
  kind = 'other',
  opportunityId,
  label = 'Upload a document',
  onUploaded,
}: DocumentUploadProps) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const pickAndUpload = async () => {
    if (state === 'uploading' || state === 'parsing') return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];

      setState('uploading');
      setMessage(asset.name);
      const result = await uploadDocument(
        {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
        },
        { kind, opportunityId },
        getToken,
      );

      if (result.parseStatus === 'done') {
        setState('done');
        setMessage(`${asset.name} — ready`);
        onUploaded?.(result.uploadId);
      } else if (result.parseStatus === 'failed') {
        setState('error');
        setMessage("Couldn't read that file. Try a PDF, DOCX, or text file.");
      } else {
        setState('parsing');
        setMessage('Processing…');
        onUploaded?.(result.uploadId);
      }
    } catch {
      setState('error');
      setMessage('Upload failed. Please try again.');
    }
  };

  const busy = state === 'uploading' || state === 'parsing';

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPress={pickAndUpload}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.accentLight,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : state === 'done' ? (
          <CheckCircle2 size={18} color={colors.success} />
        ) : state === 'error' ? (
          <AlertCircle size={18} color={colors.error} />
        ) : (
          <Upload size={18} color={colors.primary} />
        )}
        <Text style={[styles.label, { color: colors.primary }]} numberOfLines={1}>
          {busy ? 'Uploading…' : label}
        </Text>
      </Pressable>
      {message ? (
        <Text
          style={[
            styles.status,
            {
              color:
                state === 'error'
                  ? colors.error
                  : state === 'done'
                    ? colors.success
                    : colors.mutedForeground,
            },
          ]}
          numberOfLines={2}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  status: {
    fontSize: 12,
    marginTop: 6,
  },
});
