import React, { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { resolveCommunityAttachmentUrl } from '@edutu/core/src/services/communities';
import { useTheme } from '../context/ThemeContext';

type CachedImage = { url: string; expiresAt: number };
const resolvedImageCache = new Map<string, CachedImage>();

export interface GroupAvatarProps {
  resourceUrl?: string | null;
  imageUrl?: string | null;
  emoji: string;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Private group identity image. The canonical resource URL is never passed to
 * React Native's Image component; it is exchanged for a short-lived URL after
 * the backend re-checks group visibility/membership. Emoji remains the loading
 * and failure fallback, so rows never jump or render an empty square.
 */
export function GroupAvatar({
  resourceUrl,
  imageUrl,
  emoji,
  size = 44,
  radius = 13,
  style,
  testID = 'group-avatar',
}: GroupAvatarProps) {
  const { getToken } = useAuth();
  const { colors } = useTheme();
  const [resolvedImage, setResolvedImage] = useState<{
    resourceUrl: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (!resourceUrl) return () => { active = false; };

    const cached = resolvedImageCache.get(resourceUrl);
    if (cached && cached.expiresAt > Date.now() + 10_000) {
      void Promise.resolve().then(() => {
        if (active) setResolvedImage({ resourceUrl, url: cached.url });
      });
      return () => { active = false; };
    }

    void resolveCommunityAttachmentUrl(resourceUrl, getToken)
      .then(({ url, expiresIn }) => {
        if (!active) return;
        resolvedImageCache.set(resourceUrl, {
          url,
          expiresAt: Date.now() + Math.max(30, expiresIn - 30) * 1000,
        });
        setResolvedImage({ resourceUrl, url });
      })
      .catch(() => {
        if (active) setResolvedImage(null);
      });

    return () => { active = false; };
  }, [getToken, resourceUrl]);

  const resolvedUrl = resolvedImage && resolvedImage.resourceUrl === resourceUrl
    ? resolvedImage.url
    : null;
  const frame = { width: size, height: size, borderRadius: radius };
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, frame, { backgroundColor: colors.muted }, style]}
    >
      <Text style={[styles.emoji, { fontSize: Math.max(18, size * 0.44) }]}>{emoji}</Text>
      {(resolvedUrl || imageUrl) && (
        <Image
          testID={`${testID}-image`}
          source={{ uri: resolvedUrl || imageUrl || '' }}
          resizeMode="cover"
          onError={() => {
            if (resolvedUrl) setResolvedImage(null);
          }}
          style={[StyleSheet.absoluteFillObject, frame]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    textAlign: 'center',
  },
});
