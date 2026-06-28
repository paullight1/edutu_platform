import "./index.css";
import { Composition } from "remotion";
import { EdutuLaunchVideo } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
