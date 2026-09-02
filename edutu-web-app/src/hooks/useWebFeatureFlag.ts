import { useEffect, useState } from "react";
import {
  fetchWebFeatureFlags,
  type WebFeatureFlagKey,
} from "../services/webConfig";

/**
 * Reads one dark-shipped web feature flag. The hook always starts disabled and
 * remains disabled when remote config is missing or unavailable.
 */
export function useWebFeatureFlag(key: WebFeatureFlagKey): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    setEnabled(false);

    void fetchWebFeatureFlags()
      .then((flags) => {
        if (active) setEnabled(flags[key] === true);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [key]);

  return enabled;
}
