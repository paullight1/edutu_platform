from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCREEN_PATH = ROOT / "edutumobile/app/(app)/opportunities/[id].tsx"
TEST_PATH = ROOT / "edutumobile/__tests__/mobileOpportunityDetail.test.tsx"
COMPONENT_PATH = (
    ROOT
    / "edutumobile/components/opportunity/OpportunityApplicationSupportActions.tsx"
)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


COMPONENT = r"""import React from 'react';
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
"""


def update_screen() -> None:
    screen = SCREEN_PATH.read_text(encoding="utf-8")
    screen = replace_once(
        screen,
        'import { FitPanel } from "../../../components/opportunity/FitPanel";\n',
        (
            'import { OpportunityApplicationSupportActions } from '
            '"../../../components/opportunity/OpportunityApplicationSupportActions";\n'
        ),
        "replace FitPanel import",
    )
    screen = replace_once(
        screen,
        'import { AiActionBar } from "../../../components/ai/AiActionBar";\n',
        "",
        "remove AiActionBar value import",
    )
    screen = replace_once(
        screen,
        'import { DocumentUpload } from "../../../components/ai/DocumentUpload";\n',
        "",
        "remove DocumentUpload import",
    )

    start_marker = (
        "          {/* ── FIT ────────────────────────────────────────────────────────"
    )
    end_marker = (
        "          {/* ── PLAN ───────────────────────────────────────────────────────"
    )
    start = screen.find(start_marker)
    end = screen.find(end_marker, start)
    if start < 0 or end < 0 or end <= start:
        raise RuntimeError("application support extraction markers were not found")

    invocation = """          <OpportunityApplicationSupportActions
            opportunityId={id}
            opportunityTitle={title}
            isSignedIn={isSignedIn}
            accentColor={colors.accent}
            cardBackground={cardBg}
            fit={{
              eyebrow: t("detail.fit.eyebrow"),
              heading: fitLabel,
              blurb: fitBlurb,
              headline: t("detail.fit.evidenceHeadline"),
              reasons: matchReasons,
              risks: matchRisks,
              reasonsTitle: t("detail.whyMatches"),
              risksTitle: t("detail.thingsToCheck"),
              ranked: matchTier !== null,
            }}
            fitActionLabel={t("chat:winCoach.actions.fitCheck")}
            nextMoveActionLabel={t("chat:winCoach.actions.nextMove")}
            askMoreLabel={t("detail.askMore")}
            cvLabel={t("chat:winCoach.documentUpload.cvLabel")}
            onCompleteProfile={() => router.push("/profile/edit")}
            onRun={handleWinCoachRun}
            onOpenInChat={openWinCoachThread}
            onUpgrade={goToPaywall}
            onAskMore={askEdutuMore}
            onUploaded={setWinCoachUploadId}
          />

"""
    screen = screen[:start] + invocation + screen[end:]
    screen = replace_once(
        screen,
        """  askMoreChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  askMoreChipText: { fontSize: 13, fontWeight: "700" },
""",
        "",
        "move ask-more styles into component",
    )
    SCREEN_PATH.write_text(screen, encoding="utf-8")


def update_tests() -> None:
    tests = TEST_PATH.read_text(encoding="utf-8")

    helper = """function pressNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }

  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }

  current.props.onPress?.();
}
"""
    tests = replace_once(
        tests,
        helper,
        helper
        + """
function expandApplicationSupport(getByText: (text: string) => any) {
  pressNearestTouchTarget(getByText('Help me apply'));
}
""",
        "add application-support test helper",
    )
    tests = replace_once(
        tests,
        """    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

    fireEvent.press(getByText('Ask Edutu more…'));
""",
        """    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

    expandApplicationSupport(getByText);
    fireEvent.press(getByText('Ask Edutu more…'));
""",
        "expand support in signed-in chat test",
    )
    tests = replace_once(
        tests,
        """    // The chip renders for guests too — this is the whole point of the fix:
    // it used to be nested inside an `isSignedIn &&` block and disappeared.
    const chip = getByText('Ask Edutu more…');
""",
        """    // The support section remains available to guests; opening it reveals
    // the same Ask Edutu action without exposing signed-in-only tools.
    expandApplicationSupport(getByText);
    const chip = getByText('Ask Edutu more…');
""",
        "expand support in guest test",
    )
    tests = replace_once(
        tests,
        """    expect(queryByText('Plan prep')).toBeNull();
    // The win-coach pills stay: they answer in place.
    expect(getByText('Am I a fit?')).toBeTruthy();
""",
        """    expect(queryByText('Plan prep')).toBeNull();
    expect(queryByText('Am I a fit?')).toBeNull();

    expandApplicationSupport(getByText);

    // The win-coach pills stay: they answer in place.
    expect(getByText('Am I a fit?')).toBeTruthy();
""",
        "document collapsed AI support",
    )
    tests = replace_once(
        tests,
        """      await waitFor(() => expect(getByText('Strong fit')).toBeTruthy());
      expect(getByText('Matches your interest in Climate')).toBeTruthy();
""",
        """      await waitFor(() => expect(getByText('Strong fit')).toBeTruthy());
      expandApplicationSupport(getByText);
      expect(getByText('Matches your interest in Climate')).toBeTruthy();
""",
        "expand support in hydrated fit test",
    )
    tests = replace_once(
        tests,
        """      await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

      // Was rendered twice: the decision strip's fit cell AND the fit panel.
      expect(queryAllByText('Not ranked yet')).toHaveLength(1);
""",
        """      await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());
      expandApplicationSupport(getByText);

      // Was rendered twice: the decision strip's fit cell AND the fit panel.
      expect(queryAllByText('Not ranked yet')).toHaveLength(1);
""",
        "expand support in unranked fit test",
    )
    tests = replace_once(
        tests,
        """      await waitFor(() => expect(shareSpy).toHaveBeenCalledWith({
        title: 'Global Fellowship',
        message: expect.any(String),
      }));

      jest.useFakeTimers();
""",
        """      await waitFor(() => expect(shareSpy).toHaveBeenCalledWith({
        title: 'Global Fellowship',
        message: expect.any(String),
      }));

      expandApplicationSupport(getByText);
      jest.useFakeTimers();
""",
        "expand support in roadmap test",
    )

    TEST_PATH.write_text(tests, encoding="utf-8")


def main() -> None:
    if COMPONENT_PATH.exists():
        raise RuntimeError(f"temporary repair expected a new file: {COMPONENT_PATH}")
    COMPONENT_PATH.write_text(COMPONENT, encoding="utf-8")
    update_screen()
    update_tests()


if __name__ == "__main__":
    main()
