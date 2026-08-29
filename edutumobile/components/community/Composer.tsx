import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FileText, GraduationCap, Image as ImageIcon, Paperclip, SendHorizonal, X } from 'lucide-react-native';
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_IMAGE_MIME_TYPES,
  COMMUNITY_PDF_MAX_BYTES,
  type CommunityAttachmentKind,
  type CommunityImageMime,
} from '@edutu/core/src/services/communities';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';

/**
 * The message composer.
 *
 * THE ONE RULE THIS COMPONENT ENFORCES: the text is owned by the caller and is
 * NEVER cleared here. The screener can refuse a post with a sentence written for
 * the member, and a composer that empties itself on submit would delete what
 * somebody typed because a heuristic disagreed with it — the worst outcome this
 * feature can produce. The caller clears the value only after a send resolves
 * successfully; a rejection leaves the text exactly where it was, with the
 * server's sentence above it, ready to edit and resend.
 *
 * `error` is that sentence, verbatim. Never a status code, never a generic
 * failure (see the header of services/communities.ts).
 *
 * States: default · pressed (AnimatedPressable) · disabled (empty text, archived
 * or expired group) · loading (in-flight send) · error (the sentence above).
 */
export interface ComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  /** An in-flight send. The button spins; the input stays editable. */
  sending?: boolean;
  /** Archived or expired group — posting is off, the input says why. */
  disabled?: boolean;
  /** Shown in place of the helper line when posting is disabled. */
  disabledNotice?: string;
  /** The server's refusal sentence. */
  error?: string | null;
  placeholder?: string;
  testID?: string;
  replyTo?: { body: string; author?: string } | null;
  onClearReply?: () => void;
  /** The server accepts 2,000 characters, including any encoded reply context. */
  maxLength?: number;
  onAttachmentSelected?: (attachment: PickedCommunityAttachment) => Promise<void>;
  attachmentUploading?: boolean;
  attachmentProgress?: number;
  attachmentError?: string | null;
  onShareOpportunity?: () => void;
}

export interface PickedCommunityAttachment {
  kind: CommunityAttachmentKind;
  uri: string;
  name: string;
  mime: CommunityImageMime | 'application/pdf';
  size: number;
  caption?: string;
}

export function Composer({
  value,
  onChangeText,
  onSend,
  sending = false,
  disabled = false,
  disabledNotice,
  error = null,
  placeholder,
  testID = 'chat-composer',
  replyTo = null,
  onClearReply,
  maxLength = 2000,
  onAttachmentSelected,
  attachmentUploading = false,
  attachmentProgress = 0,
  attachmentError = null,
  onShareOpportunity,
}: ComposerProps) {
  const { t } = useTranslation('community');
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const replyPreview = useMemo(
    () => replyTo?.body.replace(/\s+/g, ' ').trim() ?? '',
    [replyTo],
  );
  const remaining = maxLength - value.length;
  const overLimit = remaining < 0;
  const showCount = remaining <= 200;
  const canSend = value.trim().length > 0 && !overLimit && !sending && !attachmentUploading && !disabled;
  const sendLabel = replyTo ? 'Send reply' : t('chat.send');
  const attachmentsEnabled = (!!onAttachmentSelected || !!onShareOpportunity) && !replyTo;

  const resolveSize = useCallback(async (known: number | undefined, uri: string) => {
    if (typeof known === 'number' && known > 0) return known;
    const response = await fetch(uri);
    return (await response.blob()).size;
  }, []);

  const submitAttachment = useCallback(async (attachment: PickedCommunityAttachment) => {
    if (!onAttachmentSelected) return;
    if (value.trim().length > 500) {
      setPickerError('Attachment captions must be 500 characters or fewer.');
      return;
    }
    setPickerError(null);
    try {
      await onAttachmentSelected({
        ...attachment,
        ...(value.trim() ? { caption: value.trim() } : {}),
      });
      setAttachmentMenuOpen(false);
    } catch (caught) {
      setPickerError(caught instanceof Error ? caught.message : 'The attachment could not be added.');
    }
  }, [onAttachmentSelected, value]);

  const pickImage = useCallback(async () => {
    const picker = require('expo-image-picker') as typeof import('expo-image-picker');
    const result = await picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const name = (asset.fileName || `community-image-${Date.now()}.jpg`).trim();
    const extension = name.split('.').pop()?.toLowerCase();
    const inferred = extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'jpg' || extension === 'jpeg'
          ? 'image/jpeg'
          : '';
    const mime = (asset.mimeType || inferred).toLowerCase();
    const size = await resolveSize(asset.fileSize, asset.uri);
    if (!COMMUNITY_IMAGE_MIME_TYPES.includes(mime as CommunityImageMime) || !/\.(?:jpe?g|png|webp)$/i.test(name)) {
      throw new Error('Choose a JPEG, PNG, or WebP image.');
    }
    if (size <= 0 || size > COMMUNITY_IMAGE_MAX_BYTES) {
      throw new Error('Images must be 5 MB or smaller.');
    }
    await submitAttachment({ kind: 'image', uri: asset.uri, name, mime: mime as CommunityImageMime, size });
  }, [resolveSize, submitAttachment]);

  const pickPdf = useCallback(async () => {
    const picker = require('expo-document-picker') as typeof import('expo-document-picker');
    const result = await picker.getDocumentAsync({
      type: 'application/pdf',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const name = asset.name.trim();
    const size = await resolveSize(asset.size, asset.uri);
    if ((asset.mimeType || '').toLowerCase() !== 'application/pdf' || !/\.pdf$/i.test(name)) {
      throw new Error('Choose a PDF document.');
    }
    if (size <= 0 || size > COMMUNITY_PDF_MAX_BYTES) {
      throw new Error('PDFs must be 10 MB or smaller.');
    }
    await submitAttachment({ kind: 'file', uri: asset.uri, name, mime: 'application/pdf', size });
  }, [resolveSize, submitAttachment]);

  const runPicker = useCallback(async (picker: () => Promise<void>) => {
    setPickerError(null);
    try {
      await picker();
    } catch (caught) {
      setPickerError(caught instanceof Error ? caught.message : 'The attachment could not be selected.');
    }
  }, []);

  return (
    <View
      testID={testID}
      style={[
        styles.wrap,
        { borderTopColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      {!!(error || attachmentError || pickerError) && (
        <Text
          testID={`${testID}-error`}
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: colors.error }]}
        >
          {error || attachmentError || pickerError}
        </Text>
      )}

      {attachmentMenuOpen && attachmentsEnabled && (
        <View testID={`${testID}-attachment-menu`} style={styles.attachmentMenu}>
          {onAttachmentSelected ? <AttachmentAction testID={`${testID}-pick-image`} label="Photo" icon={ImageIcon} disabled={attachmentUploading || disabled} onPress={() => void runPicker(pickImage)} /> : null}
          {onAttachmentSelected ? <AttachmentAction testID={`${testID}-pick-pdf`} label="PDF" icon={FileText} disabled={attachmentUploading || disabled} onPress={() => void runPicker(pickPdf)} /> : null}
          {onShareOpportunity ? <AttachmentAction testID={`${testID}-pick-opportunity`} label="Opportunity" icon={GraduationCap} disabled={attachmentUploading || disabled} onPress={() => { setAttachmentMenuOpen(false); onShareOpportunity(); }} /> : null}
        </View>
      )}

      {attachmentUploading && (
        <View testID={`${testID}-upload-progress`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(attachmentProgress * 100) }} style={styles.uploadStatus}>
          <Text style={[styles.notice, { color: colors.textSecondary }]}>Uploading attachment… {Math.round(attachmentProgress * 100)}%</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}><View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.max(2, attachmentProgress * 100)}%` }]} /></View>
        </View>
      )}

      {replyTo && (
        <View testID={`${testID}-reply-preview`} style={[styles.replyPreview, { borderLeftColor: colors.accent, backgroundColor: colors.card }]}>
          <View style={styles.replyCopy}>
            <Text style={[styles.replyLabel, { color: colors.accent }]}>Replying to {replyTo.author || 'member'}</Text>
            <Text style={[styles.replyBody, { color: colors.textSecondary }]} numberOfLines={2}>{replyPreview}</Text>
          </View>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="Cancel reply" accessibilityHint="Removes the quoted message and keeps your draft" onPress={onClearReply} hapticFeedback="light" scaleTo={0.9} style={styles.replyClose}>
            <X size={16} color={colors.textSecondary} />
          </AnimatedPressable>
        </View>
      )}

      {disabled && !!disabledNotice && (
        <Text
          testID={`${testID}-disabled-notice`}
          accessibilityLiveRegion="polite"
          style={[styles.notice, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {disabledNotice}
        </Text>
      )}

      <View style={styles.row}>
        {(onAttachmentSelected || onShareOpportunity) && (
          <AnimatedPressable
            testID={`${testID}-attach`}
            accessibilityRole="button"
            accessibilityLabel="Add to message"
            accessibilityHint={replyTo ? 'Finish or cancel the reply before adding an attachment' : 'Choose a supported attachment to upload'}
            accessibilityState={{ disabled: disabled || attachmentUploading || !!replyTo, expanded: attachmentMenuOpen }}
            disabled={disabled || attachmentUploading || !!replyTo}
            hapticFeedback="selection"
            onPress={() => setAttachmentMenuOpen((open) => !open)}
            style={[styles.attach, { borderColor: colors.border, opacity: disabled || attachmentUploading || replyTo ? 0.45 : 1 }]}
          >
            <Paperclip size={19} color={colors.foreground} />
          </AnimatedPressable>
        )}
        <TextInput
          ref={inputRef}
          testID={`${testID}-input`}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          multiline
          maxLength={maxLength}
          blurOnSubmit={false}
          returnKeyType="default"
          enablesReturnKeyAutomatically
          placeholder={placeholder ?? t('chat.composerPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('chat.composerPlaceholder')}
          accessibilityHint="Type a message to everyone in this group"
          style={[
            styles.input,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor: error || overLimit ? colors.error : colors.border,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        />

        <AnimatedPressable
          testID={`${testID}-send`}
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: !canSend, busy: sending }}
          disabled={!canSend}
          hapticFeedback="light"
          onPress={onSend}
          style={[
            styles.send,
            {
              backgroundColor: canSend ? colors.accent : colors.muted,
              opacity: canSend ? 1 : 0.7,
            },
          ]}
        >
          <View style={styles.sendInner}>
            {sending ? (
              <ActivityIndicator testID={`${testID}-sending`} size="small" color="#FFFFFF" />
            ) : (
              <SendHorizonal
                size={18}
                color={canSend ? '#FFFFFF' : colors.textSecondary}
                strokeWidth={2.4}
              />
            )}
          </View>
        </AnimatedPressable>
      </View>

      {showCount && (
        <Text
          testID={`${testID}-count`}
          accessibilityLiveRegion={overLimit ? 'polite' : 'none'}
          style={[styles.count, { color: overLimit ? colors.error : colors.textSecondary }]}
        >
          {overLimit ? `${Math.abs(remaining)} over the message limit` : `${remaining} characters left`}
        </Text>
      )}
    </View>
  );
}

function AttachmentAction({ testID, label, icon: Icon, disabled, onPress }: { testID: string; label: string; icon: React.ComponentType<{ size?: number; color?: string }>; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable testID={testID} accessibilityRole="button" accessibilityLabel={`Add ${label}`} accessibilityState={{ disabled }} disabled={disabled} hapticFeedback="selection" onPress={onPress} style={[styles.attachmentAction, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Icon size={17} color={colors.accent} />
      <Text style={[styles.attachmentLabel, { color: colors.foreground }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  attach: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  attachmentMenu: { flexDirection: 'row', gap: 8 },
  attachmentAction: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  attachmentLabel: { fontSize: 13, fontWeight: '700' },
  uploadStatus: { gap: 5 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  sendInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
  },
  notice: {
    fontSize: 12,
    lineHeight: 18,
  },
  replyPreview: {
    minHeight: 42,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyCopy: { flex: 1, gap: 2 },
  replyLabel: { fontSize: 11, fontWeight: '800' },
  replyBody: { fontSize: 12 },
  replyClose: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 11, lineHeight: 15, textAlign: 'right', paddingRight: 54 },
});
