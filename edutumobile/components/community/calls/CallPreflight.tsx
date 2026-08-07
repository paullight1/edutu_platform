import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MicOff, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable } from '../../ui/AnimatedPressable';
import { useTheme } from '../../context/ThemeContext';

export function CallPreflight({ busy, onJoin }: { busy: boolean; onJoin: () => void }) {
  const { t } = useTranslation('community'); const { colors } = useTheme();
  return <View testID="call-preflight" style={styles.wrap}><View style={[styles.hero,{backgroundColor:`${colors.accent}16`}]}><MicOff size={34} color={colors.accent}/></View><Text style={[styles.title,{color:colors.foreground}]}>{t('calls.preflightTitle')}</Text><Text style={[styles.body,{color:colors.textSecondary}]}>{t('calls.preflightBody')}</Text><View style={styles.note}><ShieldCheck size={16} color={colors.success}/><Text style={[styles.noteText,{color:colors.textSecondary}]}>{t('calls.privacy')}</Text></View><AnimatedPressable testID="call-join" accessibilityRole="button" accessibilityLabel={t('calls.join')} accessibilityState={{disabled:busy,busy}} disabled={busy} onPress={onJoin} style={[styles.button,{backgroundColor:colors.accent,opacity:busy?0.55:1}]}><Text style={styles.buttonText}>{busy?t('calls.connecting'):t('calls.join')}</Text></AnimatedPressable></View>;
}
const styles=StyleSheet.create({wrap:{flex:1,justifyContent:'center',alignItems:'center',padding:28},hero:{width:72,height:72,borderRadius:24,alignItems:'center',justifyContent:'center'},title:{fontSize:22,fontWeight:'800',marginTop:20,textAlign:'center'},body:{fontSize:15,lineHeight:22,textAlign:'center',marginTop:8,maxWidth:340},note:{flexDirection:'row',gap:8,alignItems:'center',marginTop:18},noteText:{fontSize:12,flexShrink:1},button:{height:52,borderRadius:26,marginTop:28,minWidth:220,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:15,fontWeight:'800',color:'#fff'}});
