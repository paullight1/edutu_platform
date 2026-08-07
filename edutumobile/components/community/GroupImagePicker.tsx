import React, { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Camera, ImagePlus, Trash2 } from 'lucide-react-native';
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_IMAGE_MIME_TYPES,
  type CommunityImageMime,
} from '@edutu/core/src/services/communities';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';
import { GroupAvatar } from './GroupAvatar';

export interface PickedGroupImage {
  uri: string;
  name: string;
  mime: CommunityImageMime;
  size: number;
}

interface GroupImagePickerProps {
  resourceUrl?: string | null;
  emoji: string;
  selected?: PickedGroupImage | null;
  disabled?: boolean;
  canRemove?: boolean;
  onChange: (image: PickedGroupImage) => void;
  onRemove?: () => void;
  onError?: (message: string | null) => void;
  testID?: string;
}

function inferMime(name: string, uri: string): CommunityImageMime | null {
  const candidate = `${name} ${uri}`.toLowerCase();
  if (/\.png(?:\?|\s|$)/.test(candidate)) return 'image/png';
  if (/\.webp(?:\?|\s|$)/.test(candidate)) return 'image/webp';
  if (/\.jpe?g(?:\?|\s|$)/.test(candidate)) return 'image/jpeg';
  return null;
}

function extensionFor(mime: CommunityImageMime): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export function GroupImagePicker({
  resourceUrl,
  emoji,
  selected = null,
  disabled = false,
  canRemove = false,
  onChange,
  onRemove,
  onError,
  testID = 'group-image-picker',
}: GroupImagePickerProps) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);

  const pick = useCallback(async () => {
    if (disabled || picking) return;
    setPicking(true);
    onError?.(null);
    try {
      const picker = require('expo-image-picker') as typeof import('expo-image-picker');
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;

      const suppliedMime = (asset.mimeType || '').toLowerCase();
      const inferredMime = inferMime(asset.fileName || '', asset.uri);
      const mime = COMMUNITY_IMAGE_MIME_TYPES.includes(suppliedMime as CommunityImageMime)
        ? suppliedMime as CommunityImageMime
        : inferredMime;
      if (!mime) throw new Error('Choose a JPEG, PNG, or WebP image.');

      const size = typeof asset.fileSize === 'number' && asset.fileSize > 0
        ? asset.fileSize
        : (await (await fetch(asset.uri)).blob()).size;
      if (size <= 0 || size > COMMUNITY_IMAGE_MAX_BYTES) {
        throw new Error('Group photos must be 5 MB or smaller.');
      }

      const rawName = (asset.fileName || '').trim();
      const safeName = /\.(?:jpe?g|png|webp)$/i.test(rawName)
        ? rawName
        : `group-photo-${Date.now()}.${extensionFor(mime)}`;
      onChange({ uri: asset.uri, name: safeName, mime, size });
    } catch (caught) {
      onError?.(caught instanceof Error ? caught.message : 'The photo could not be selected.');
    } finally {
      setPicking(false);
    }
  }, [disabled, onChange, onError, picking]);

  const hasPhoto = !!selected || !!resourceUrl;
  return (
    <View testID={testID} style={styles.row}>
      <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.muted }]}>
        {selected ? (
          <Image testID={`${testID}-local-image`} source={{ uri: selected.uri }} style={styles.previewImage} />
        ) : (
          <GroupAvatar
            testID={`${testID}-avatar`}
            resourceUrl={resourceUrl}
            emoji={emoji}
            size={76}
            radius={22}
          />
        )}
        <View style={[styles.cameraBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}>
          <Camera size={14} color="#FFFFFF" strokeWidth={2.4} />
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>Group photo</Text>
        <Text style={[styles.helper, { color: colors.textSecondary }]}>
          Square JPEG, PNG, or WebP · up to 5 MB
        </Text>
        <View style={styles.actions}>
          <AnimatedPressable
            testID={`${testID}-choose`}
            accessibilityRole="button"
            accessibilityLabel={hasPhoto ? 'Change group photo' : 'Choose group photo'}
            accessibilityState={{ disabled, busy: picking }}
            disabled={disabled || picking}
            onPress={() => void pick()}
            style={[styles.action, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}
          >
            <ImagePlus size={16} color={colors.accent} />
            <Text style={[styles.actionText, { color: colors.foreground }]}>
              {hasPhoto ? 'Change' : 'Choose photo'}
            </Text>
          </AnimatedPressable>
          {canRemove && hasPhoto && !!onRemove && (
            <AnimatedPressable
              testID={`${testID}-remove`}
              accessibilityRole="button"
              accessibilityLabel="Remove group photo"
              disabled={disabled}
              onPress={onRemove}
              style={[styles.removeAction, { opacity: disabled ? 0.5 : 1 }]}
            >
              <Trash2 size={15} color={colors.error} />
              <Text style={[styles.removeText, { color: colors.error }]}>Remove</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  preview: { width: 78, height: 78, borderRadius: 23, borderWidth: 1, overflow: 'visible' },
  previewImage: { width: 76, height: 76, borderRadius: 22 },
  cameraBadge: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 27,
    height: 27,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  helper: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5 },
  action: {
    minHeight: 36,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actionText: { fontSize: 13, fontWeight: '700' },
  removeAction: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeText: { fontSize: 13, fontWeight: '700' },
});
