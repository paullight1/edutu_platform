import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FitPanel } from './FitPanel';
import {
  AiActionBar,
  type AiAction,
  type AiActionResult,
} from '../ai/AiActionBar';
import { DocumentUpload } from '../ai/DocumentUpload';
import { AiOrbBadge } from '../ui/AiOrbBadge';

type FitContent = {
  eyebrow: string;
  heading: string;
  blurb: string;
  headline: string;
  reasons: string[];
  risks: string[];
  reasonsTitle: string;
  risksTitle: string;
  ranked: boolean;
};

type OpportunityApplicationSupportActionsProps = {
  opportunityId: string;
  opportunityTitle: string;
  isSignedIn: boolean;
  accentColor: string;
  cardBackground: string;
  fit: FitContent;
  fitActionLabel: string;
  nextMoveActionLabel: string;
  askMoreLabel: string;
  cvLabel: string;
  onCompleteProfile: () => void;
  onRun: (action: AiAction) => Promise<AiActionResult>;
  onOpenInChat: (threadId: string) => void;
  onUpgrade: () => void;
  onAskMore: () => void;
  onUploaded: (uploadId: string) => void;
};

/**
 * Optional application support shown after source-backed opportunity details.
 * Keeping these tools together prevents AI actions from competing with the
 * facts a learner needs to make a decision.
 */
export function OpportunityApplicationSupportActions({
  opportunityId,
  opportunityTitle,
  isSignedIn,
  accentColor,
  cardBackground,
  fit,
  fitActionLabel,
  nextMoveActionLabel,
  askMoreLabel,
  cvLabel,
  onCompleteProfile,
  onRun,
  onOpenInChat,
  onUpgrade,
  onAskMore,
  onUploaded,
}: OpportunityApplicationSupportActionsProps) {
  const actions: AiAction[] = [
    {
      label: fitActionLabel,
      intent: 'fit_check',
      message: `Am I a good fit for "${opportunityTitle}"? Give me an honest assessment.`,
    },
    {
      label: nextMoveActionLabel,
      intent: 'next_move',
      message: `What's my single most important next move to win "${opportunityTitle}"?`,
    },
  ];

  return (
    <>
      <FitPanel {...fit} onCompleteProfile={onCompleteProfile} />

      <View style={styles.actions}>
        {isSignedIn ? (
          <AiActionBar
            actions={actions}
            onRun={onRun}
            onOpenInChat={onOpenInChat}
            onUpgrade={onUpgrade}
          />
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={askMoreLabel}
          onPress={onAskMore}
          activeOpacity={0.8}
          style={[
            styles.askMoreChip,
            {
              borderColor: `${accentColor}30`,
              backgroundColor: cardBackground,
            },
          ]}
        >
          <AiOrbBadge size={18} />
          <Text style={[styles.askMoreChipText, { color: accentColor }]}>
            {askMoreLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {isSignedIn ? (
        <View style={styles.upload}>
          <DocumentUpload
            kind="cv"
            opportunityId={opportunityId}
            label={cvLabel}
            onUploaded={onUploaded}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: 12, gap: 10 },
  upload: { marginTop: 12 },
  askMoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  askMoreChipText: { fontSize: 13, fontWeight: '700' },
});
