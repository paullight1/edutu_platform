import "./index.css";
import { Composition } from "remotion";
import { EdutuLaunchVideo } from "./Composition";
import { EdutuAd, TOTAL_DURATION } from "./ad/EdutuAd";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EdutuAd"
        component={EdutuAd}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="EdutuLaunch"
        component={EdutuLaunchVideo}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
