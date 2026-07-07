import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { AgitateScene, HookScene, RevealScene } from "./ScenesA";
import { MatchingScene, RoadmapScene } from "./ScenesB";
import { CtaScene, ProofScene, TrackingScene } from "./ScenesC";
import { NAVY } from "./theme";

const TIMELINE = [
  { component: HookScene, duration: 120 },
  { component: AgitateScene, duration: 150 },
  { component: RevealScene, duration: 135 },
  { component: MatchingScene, duration: 195 },
  { component: RoadmapScene, duration: 195 },
  { component: TrackingScene, duration: 180 },
  { component: ProofScene, duration: 165 },
  { component: CtaScene, duration: 150 },
] as const;

export const TOTAL_DURATION = TIMELINE.reduce((a, s) => a + s.duration, 0); // 1290

export const EdutuAd: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {TIMELINE.map(({ component: Scene, duration }, i) => {
        const from = cursor;
        cursor += duration;
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <Scene duration={duration} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
