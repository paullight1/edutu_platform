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
import { useTranslation } from 'react-i18next';
import {
  uploadDocument,
  type UploadKind,
} from '@edutu/core/src/services/uploads';
import { useTheme } from '../context/ThemeContext';
import { withAlpha } from '../ui/BottomScrim';
import { AiAssistTile } from './AiAssistTile';
import {
  CheckmarkCircle02Icon,
  Alert02Icon,
  FileUploadIcon,
} from '../ui/icons';
import { haptics } from '../../lib/haptics';

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
  /**
   * `button` (default) is the original full-width outlined control. `tile`
   * renders it as a cell of the opportunity page's AI assist grid so it sits
   * flush with the win-coach actions instead of forming a fourth, wider row.
   */
  variant?: 'button' | 'tile';
};

/**
 * Lets the user attach a real document (CV, transcript, essay). Picks a file,
 * uploads it, triggers parsing, and reports the parsed upload id so the coach
 * can read it. Self-contained — screens just drop it in.
 */
export function DocumentUpload({
  kind = 'other',
  opportunityId,
  label,
  onUploaded,
  variant = 'button',
}: DocumentUploadProps) {
  const { t } = useTranslation('chat');
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const resolvedLabel = label ?? t('winCoach.documentUpload.defaultLabel');

  const pickAndUpload = async () => {
    if (state === 'uploading' || state === 'parsing') return;
    haptics.light();
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
        setMessage(t('winCoach.documentUpload.ready', { name: asset.name }));
        haptics.success();
        onUploaded?.(result.uploadId);
      } else if (result.parseStatus === 'failed') {
        setState('error');
        setMessage(t('winCoach.documentUpload.readFailed'));
        haptics.error();
      } else {
        setState('parsing');
        setMessage(t('winCoach.documentUpload.processing'));
        onUploaded?.(result.uploadId);
      }
    } catch {
      setState('error');
      setMessage(t('winCoach.documentUpload.uploadFailed'));
      haptics.error();
    }
  };

  const busy = state === 'uploading' || state === 'parsing';

  const status = message ? (
    <Text
      style={[
        styles.status,
        variant === 'tile' && styles.statusTile,
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
  ) : null;

  if (variant === 'tile') {
    return (
      <View style={styles.tileCell}>
        <AiAssistTile
          fill={false}
          label={busy ? t('winCoach.documentUpload.uploading') : resolvedLabel}
          // The icon carries the outcome, since a tile has no room for a
          // second line and the status text below it belongs to the whole grid
          // rather than this one cell.
          icon={
            state === 'done'
              ? CheckmarkCircle02Icon
              : state === 'error'
                ? Alert02Icon
                : FileUploadIcon
          }
          iconColor={
            state === 'done'
              ? colors.success
              : state === 'error'
                ? colors.error
                : undefined
          }
          busy={busy}
          onPress={pickAndUpload}
          accessibilityLabel={resolvedLabel}
        />
        {status}
      </View>
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={resolvedLabel}
        disabled={busy}
        onPress={pickAndUpload}
        style={({ pressed }) => [
          styles.button,
          {
            // Soft accent tint (not `accentLight`, a saturated indigo that hid
            // the primary-colored label/icon in light mode).
            backgroundColor: withAlpha(colors.primary, 0.1),
            borderColor: withAlpha(colors.primary, 0.22),
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
          {busy ? t('winCoach.documentUpload.uploading') : resolvedLabel}
        </Text>
      </Pressable>
      {status}
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
  // One column of the assist grid. `flex: 1` here (not on the tile) keeps the
  // cell the same width as its neighbour while the tile keeps its fixed height.
  tileCell: { flex: 1 },
  statusTile: { fontSize: 11.5, marginTop: 5 },
});
