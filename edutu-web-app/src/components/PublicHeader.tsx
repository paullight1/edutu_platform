import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import HomepageHeader from "./HomepageHeader";

interface PublicHeaderProps {
  fixed?: boolean;
  onPrimaryAction?: () => void;
  darkAtTop?: boolean;
}

/** Shared public header so public routes use the same navigation and menu. */
export default function PublicHeader({
  fixed = false,
  onPrimaryAction,
  darkAtTop = false,
}: PublicHeaderProps) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const onGetStarted = () => {
    if (onPrimaryAction) {
      onPrimaryAction();
      return;
    }
    navigate(isSignedIn ? "/dashboard" : "/auth?mode=sign-up&screen=full");
  };

  return (
    <HomepageHeader
      onGetStarted={onGetStarted}
      publicMode
      fixed={fixed}
      darkAtTop={darkAtTop}
    />
  );
}
