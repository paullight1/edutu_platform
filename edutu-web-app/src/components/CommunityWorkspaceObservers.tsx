import { CommunityProtectedImageHydrator } from "./CommunityProtectedImage";
import CommunityReportDialogAccessibility from "./CommunityReportDialogAccessibility";

export default function CommunityWorkspaceObservers() {
  return (
    <>
      <CommunityProtectedImageHydrator />
      <CommunityReportDialogAccessibility />
    </>
  );
}
