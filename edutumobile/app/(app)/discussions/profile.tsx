import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  ChevronRight,
  Edit3,
  MessageCircle,
  UserPlus,
} from 'lucide-react-native';
import { fetchProfile, type BackendProfile } from '@edutu/core/src/services/profile';
import { fetchCommunityStories } from '@edutu/core/src/services/community';
import type { CommunityStory } from '@edutu/core/src/types/community';
import { supabase } from '../../../lib/supabase';
import { useTheme, type ThemeColors } from '../../../components/context/ThemeContext';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { StateView } from '../../../components/state';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function CommunityProfileScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const [profile, setProfile] = useState<BackendProfile | null>(null);
  const [stories, setStories] = useState<CommunityStory[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    void fetchProfile(getToken).then(setProfile).catch(() => undefined);
    void fetchCommunityStories(supabase, { limit: 50, orderBy: 'createdAt' })
      .then(setStories)
      .catch(() => undefined);
  }, [getToken]);

  const name = profile?.fullName || user?.fullName || 'Your profile';
  const email = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? '';
  const ownStories = useMemo(
    () => stories.filter((story) => {
      const creatorEmail = story.creator.email?.trim().toLowerCase();
      if (email && creatorEmail) return creatorEmail === email;
      return !creatorEmail && story.creator.name.trim().toLowerCase() === name.trim().toLowerCase();
    }),
    [email, name, stories],
  );

  const education = [profile?.major, profile?.school].filter(Boolean).join(' · ');
  const supportingLine = education || profile?.country || 'Learning, building, and meeting people on the same path.';
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
        Alert.alert('Photo access needed', 'Allow photo access to choose a profile picture.');
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
        Alert.alert('Image is too large', 'Choose an image smaller than 5 MB.');
        return;
      }

      setUploadingAvatar(true);
      await user.setProfileImage({ file: asset.uri });
      await user.reload();
    } catch {
      Alert.alert('Could not update photo', 'Please try another image or try again later.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [uploadingAvatar, user]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
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
            accessibilityLabel="Edit profile"
            onPress={() => router.push('/profile/edit' as never)}
            style={[styles.editButton, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={styles.buttonInner}>
              <Edit3 size={16} color={colors.foreground} />
              <Text style={[styles.editText, { color: colors.foreground }]}>Edit profile</Text>
            </View>
          </AnimatedPressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Connect</Text>
          <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>Your community</Text>
        </View>
        <View style={styles.actionGrid}>
          <ProfileAction
            icon={MessageCircle}
            title="Messages"
            body="Private chats and requests"
            colors={colors}
            onPress={() => router.push('/discussions/chats' as never)}
          />
          <ProfileAction
            icon={UserPlus}
            title="Find people"
            body="Discover groups and members"
            colors={colors}
            onPress={() => router.push('/discussions/explore' as never)}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your posts</Text>
          <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>{ownStories.length}</Text>
        </View>

        {ownStories.length > 0 ? (
          <View style={[styles.postList, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {ownStories.map((story, index) => (
              <ProfilePost key={story.id} story={story} colors={colors} last={index === ownStories.length - 1} />
            ))}
          </View>
        ) : (
          <StateView
            state={{ kind: 'empty', reason: 'firstRun' }}
            flow="community"
            fill={false}
            sceneSize={136}
            style={styles.postsEmpty}
            title="No posts yet"
            body="Your shared roadmaps, resources, and wins will appear here."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileAction({
  icon: Icon,
  title,
  body,
  colors,
  onPress,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  title: string;
  body: string;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.actionInner}>
        <View style={[styles.actionIcon, { backgroundColor: `${colors.accent}18` }]}>
          <Icon size={20} color={colors.accent} strokeWidth={2.2} />
        </View>
        <View style={styles.actionCopy}>
          <Text style={[styles.actionTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.actionBody, { color: colors.textSecondary }]} numberOfLines={2}>{body}</Text>
        </View>
        <ChevronRight size={17} color={colors.textSecondary} />
      </View>
    </AnimatedPressable>
  );
}

function ProfilePost({ story, colors, last }: { story: CommunityStory; colors: ThemeColors; last: boolean }) {
  return (
    <View style={[styles.postRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.postMark, { backgroundColor: `${colors.accent}18` }]}>
        <Text style={[styles.postMarkText, { color: colors.accent }]}>{story.category.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.postCopy}>
        <Text style={[styles.postTitle, { color: colors.foreground }]} numberOfLines={2}>{story.title}</Text>
        <Text style={[styles.postMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {story.category} · {story.stats.likes ?? 0} likes
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
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10, marginBottom: 11 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.25 },
  sectionMeta: { fontSize: 12, fontWeight: '700' },
  actionGrid: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  actionCard: { flex: 1, minHeight: 126, borderWidth: 1, borderRadius: 18 },
  actionInner: { flex: 1, padding: 14, justifyContent: 'space-between' },
  actionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { gap: 3, marginTop: 12, paddingRight: 10 },
  actionTitle: { fontSize: 14, fontWeight: '800' },
  actionBody: { fontSize: 11.5, lineHeight: 16 },
  postList: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, overflow: 'hidden' },
  postRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  postMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  postMarkText: { fontSize: 16, fontWeight: '800' },
  postCopy: { flex: 1, gap: 3 },
  postTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  postMeta: { fontSize: 11.5 },
  postsEmpty: { minHeight: 270, paddingTop: 8 },
});
