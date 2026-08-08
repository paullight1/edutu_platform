import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import {
  BookOpen,
  Camera,
  Edit3,
} from 'lucide-react-native';
import { fetchProfile, type BackendProfile } from '@edutu/core/src/services/profile';
import {
  fetchOwnCommunityContent,
  type CommunityProfileContentItem,
  type CommunityResourceCursor,
} from '@edutu/core/src/services/communities';
import { useTheme, type ThemeColors } from '../../../components/context/ThemeContext';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { StateView } from '../../../components/state';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function CommunityProfileScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation('community');
  const [profile, setProfile] = useState<BackendProfile | null>(null);
  const [stories, setStories] = useState<CommunityProfileContentItem[]>([]);
  const [contentCursor, setContentCursor] = useState<CommunityResourceCursor | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentLoadingMore, setContentLoadingMore] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [activeSection, setActiveSection] = useState<'posts' | 'resources'>('posts');

  useEffect(() => {
    void fetchProfile(getToken).then(setProfile).catch(() => undefined);
    setContentLoading(true);
    void fetchOwnCommunityContent(getToken)
      .then((page) => {
        setStories(page.items);
        setContentCursor(page.nextCursor);
        setContentError(false);
      })
      .catch(() => setContentError(true))
      .finally(() => setContentLoading(false));
  }, [getToken]);

  const name = profile?.fullName || user?.fullName || t('profile.yourProfile');
  const ownResources = useMemo(
    () => stories.flatMap((story) => story.resources.map((resource) => ({
      ...resource,
      rowKey: `${story.id}:${resource.id}`,
      storyTitle: story.title,
    }))),
    [stories],
  );

  const loadMoreContent = useCallback(async () => {
    if (!contentCursor || contentLoadingMore) return;
    setContentLoadingMore(true);
    try {
      const page = await fetchOwnCommunityContent(getToken, contentCursor);
      setStories((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        page.items.forEach((item) => byId.set(item.id, item));
        return [...byId.values()];
      });
      setContentCursor(page.nextCursor);
      setContentError(false);
    } catch {
      setContentError(true);
    } finally {
      setContentLoadingMore(false);
    }
  }, [contentCursor, contentLoadingMore, getToken]);

  const education = [profile?.major, profile?.school].filter(Boolean).join(' · ');
  const supportingLine = education || profile?.country || t('profile.supportingLine');
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const changePhoto = useCallback(async () => {
    if (!user || uploadingAvatar) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('profile.photoPermissionTitle'), t('profile.photoPermissionBody'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) {
        Alert.alert(t('profile.photoTooLargeTitle'), t('profile.photoTooLargeBody'));
        return;
      }

      setUploadingAvatar(true);
      await user.setProfileImage({ file: asset.uri });
      await user.reload();
    } catch {
      Alert.alert(t('profile.photoFailedTitle'), t('profile.photoFailedBody'));
    } finally {
      setUploadingAvatar(false);
    }
  }, [t, uploadingAvatar, user]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.changePhoto')}
            onPress={() => void changePhoto()}
            disabled={uploadingAvatar}
            style={styles.avatarButton}
          >
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={[styles.avatar, { borderColor: colors.border }]} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.initials, { color: colors.accent }]}>{initials}</Text>
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}>
              {uploadingAvatar ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Camera size={15} color="#FFFFFF" strokeWidth={2.4} />}
            </View>
          </AnimatedPressable>

          <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
          <Text style={[styles.supporting, { color: colors.textSecondary }]} numberOfLines={2}>{supportingLine}</Text>

          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.editProfile')}
            onPress={() => router.push('/profile/edit' as never)}
            style={[styles.editButton, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={styles.buttonInner}>
              <Edit3 size={16} color={colors.foreground} />
              <Text style={[styles.editText, { color: colors.foreground }]}>{t('profile.editProfile')}</Text>
            </View>
          </AnimatedPressable>
        </View>

        <View style={[styles.sectionSwitcher, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['posts', 'resources'] as const).map((section) => {
            const selected = activeSection === section;
            const label = section === 'posts' ? t('profile.posts') : t('profile.resources');
            return (
              <AnimatedPressable
                key={section}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                onPress={() => setActiveSection(section)}
                style={[
                  styles.sectionTab,
                  selected && { backgroundColor: `${colors.accent}20` },
                ]}
              >
                <Text style={[styles.sectionTabText, { color: selected ? colors.accent : colors.textSecondary }]}>
                  {label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {activeSection === 'posts' ? t('profile.yourPosts') : t('profile.yourResources')}
          </Text>
          <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
            {activeSection === 'posts' ? stories.length : ownResources.length}
          </Text>
        </View>

        {contentLoading && stories.length === 0 ? (
          <View style={styles.initialContentLoading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : activeSection === 'posts' ? (
          stories.length > 0 ? (
            <View style={[styles.postList, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {stories.map((story, index) => (
                <ProfilePost key={story.id} story={story} colors={colors} last={index === stories.length - 1} />
              ))}
            </View>
          ) : (
            <StateView
              state={{ kind: 'empty', reason: 'firstRun' }}
              flow="community"
              fill={false}
              sceneSize={136}
              style={styles.postsEmpty}
              title={t('profile.noPosts')}
              body={t('profile.noPostsBody')}
            />
          )
        ) : ownResources.length > 0 ? (
          <View style={[styles.postList, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {ownResources.map((resource, index) => (
              <ProfileResourceRow
                key={resource.rowKey}
                resource={resource}
                colors={colors}
                last={index === ownResources.length - 1}
              />
            ))}
          </View>
        ) : (
          <StateView
            state={{ kind: 'empty', reason: 'firstRun' }}
            flow="community"
            fill={false}
            sceneSize={136}
            style={styles.postsEmpty}
            title={t('profile.noResources')}
            body={t('profile.noResourcesBody')}
          />
        )}
        {contentLoading && stories.length > 0 ? <ActivityIndicator style={styles.contentProgress} color={colors.accent} /> : null}
        {contentError ? (
          <Text accessibilityLiveRegion="polite" style={[styles.contentError, { color: colors.error }]}>{t('profile.contentError')}</Text>
        ) : null}
        {contentCursor ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.loadMoreA11y')}
            disabled={contentLoadingMore}
            onPress={() => void loadMoreContent()}
            style={[styles.loadMore, { borderColor: colors.border, opacity: contentLoadingMore ? 0.6 : 1 }]}
          >
            {contentLoadingMore ? <ActivityIndicator color={colors.accent} /> : <Text style={[styles.loadMoreText, { color: colors.accent }]}>{t('profile.loadMore')}</Text>}
          </AnimatedPressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type ProfileResource = CommunityProfileContentItem['resources'][number] & { rowKey: string; storyTitle: string };

function ProfileResourceRow({ resource, colors, last }: { resource: ProfileResource; colors: ThemeColors; last: boolean }) {
  const openResource = () => {
    if (resource.url) void Linking.openURL(resource.url).catch(() => undefined);
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${resource.title}. ${resource.provider || resource.storyTitle}`}
      accessibilityState={{ disabled: !resource.url }}
      disabled={!resource.url}
      onPress={openResource}
      style={[styles.resourceRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={[styles.postMark, { backgroundColor: `${colors.accent}18` }]}>
        <BookOpen size={18} color={colors.accent} strokeWidth={2.2} />
      </View>
      <View style={styles.postCopy}>
        <Text style={[styles.postTitle, { color: colors.foreground }]} numberOfLines={2}>{resource.title}</Text>
        <Text style={[styles.postMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {resource.provider || resource.type || resource.storyTitle}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function ProfilePost({ story, colors, last }: { story: CommunityProfileContentItem; colors: ThemeColors; last: boolean }) {
  return (
    <View style={[styles.postRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.postMark, { backgroundColor: `${colors.accent}18` }]}>
        <Text style={[styles.postMarkText, { color: colors.accent }]}>{story.category.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.postCopy}>
        <Text style={[styles.postTitle, { color: colors.foreground }]} numberOfLines={2}>{story.title}</Text>
        <Text style={[styles.postMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {story.category} · {story.likes} likes
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 132 },
  identity: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 28 },
  avatarButton: { width: 104, height: 104, marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 29, fontWeight: '800', letterSpacing: -0.5 },
  cameraBadge: { position: 'absolute', right: 0, bottom: 5, width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  supporting: { maxWidth: 320, marginTop: 5, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  editButton: { width: 154, minHeight: 42, marginTop: 17, borderWidth: 1, borderRadius: 13 },
  buttonInner: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  editText: { fontSize: 13, fontWeight: '800' },
  sectionSwitcher: { flexDirection: 'row', padding: 4, borderWidth: 1, borderRadius: 15, marginBottom: 18 },
  sectionTab: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTabText: { fontSize: 13, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.25 },
  sectionMeta: { fontSize: 12, fontWeight: '700' },
  postList: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, overflow: 'hidden' },
  postRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  resourceRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  postMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  postMarkText: { fontSize: 16, fontWeight: '800' },
  postCopy: { flex: 1, gap: 3 },
  postTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  postMeta: { fontSize: 11.5 },
  postsEmpty: { minHeight: 270, paddingTop: 8 },
  initialContentLoading: { minHeight: 270, alignItems: 'center', justifyContent: 'center' },
  contentProgress: { marginTop: 18 },
  contentError: { marginTop: 14, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  loadMore: { minHeight: 44, marginTop: 16, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  loadMoreText: { fontSize: 13, fontWeight: '800' },
});
