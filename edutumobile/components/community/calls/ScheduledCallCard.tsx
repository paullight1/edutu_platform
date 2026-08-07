import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarClock, Phone, PhoneCall } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable } from '../../ui/AnimatedPressable';
import { useTheme } from '../../context/ThemeContext';
import { canManageCommunityCall, type CommunityCall } from '../../../features/community-calls/api';

export interface ScheduledCallCardProps { call: CommunityCall; viewerRole?: string | null; compact?: boolean; onPress: () => void; onStart?: () => void }
export function ScheduledCallCard({ call, viewerRole, compact = false, onPress, onStart }: ScheduledCallCardProps) {
  const { t, i18n } = useTranslation('community'); const { colors } = useTheme();
  const missed = call.viewerInviteStatus === 'missed' || call.viewerInviteStatus === 'unreachable';
  const live = call.status === 'live' || call.status === 'starting';
  const status = missed ? t('calls.missed') : live ? t('calls.live') : t(`calls.status.${call.status}`);
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: compact ? 'short' : 'medium', timeStyle: 'short' }).format(new Date(call.scheduledFor));
  return (
    <AnimatedPressable testID={`community-call-card-${call.id}`} accessibilityRole="button" accessibilityLabel={`${call.title}. ${status}. ${when}`} onPress={onPress}
      style={[styles.card, compact && styles.compact, { backgroundColor: colors.card, borderColor: live ? colors.accent : colors.border }]}>
      <View style={[styles.icon, { backgroundColor: `${live ? colors.accent : colors.textSecondary}18` }]}>{live ? <PhoneCall size={20} color={colors.accent} /> : <CalendarClock size={20} color={colors.textSecondary} />}</View>
      <View style={styles.body}><Text style={[styles.eyebrow, { color: live ? colors.accent : missed ? colors.error : colors.textSecondary }]}>{status}</Text><Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{call.title}</Text><Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{when} · {t('calls.minutes', { count: call.durationMinutes })}</Text></View>
      {live && <View style={[styles.join, { backgroundColor: colors.accent }]}><Phone size={15} color="#fff" /></View>}
      {!compact && call.status === 'scheduled' && canManageCommunityCall(viewerRole) && onStart ? <AnimatedPressable testID="community-call-start" accessibilityRole="button" accessibilityLabel={t('calls.start')} onPress={(event) => { event?.stopPropagation?.(); onStart(); }} style={[styles.start, { borderColor: colors.accent }]}><Text style={[styles.startText, { color: colors.accent }]}>{t('calls.start')}</Text></AnimatedPressable> : null}
    </AnimatedPressable>
  );
}
const styles = StyleSheet.create({ card:{minHeight:76,borderWidth:1,borderRadius:16,borderCurve:'continuous',padding:12,marginHorizontal:16,marginVertical:6,flexDirection:'row',alignItems:'center',gap:10},compact:{minHeight:68,marginVertical:5},icon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},body:{flex:1,minWidth:0},eyebrow:{fontSize:11,fontWeight:'800',textTransform:'uppercase'},title:{fontSize:15,fontWeight:'700',marginTop:2},meta:{fontSize:12,marginTop:3},join:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center'},start:{minHeight:36,paddingHorizontal:12,borderWidth:1,borderRadius:18,justifyContent:'center'},startText:{fontSize:12,fontWeight:'800'} });
