import { Navigate, Route, Routes, useParams } from "react-router-dom";
import CommunityExplorePage from "./CommunityExplorePage";
import CommunityGroupsPage from "./CommunityGroupsPage";
import CommunityCreateGroupPage from "./CommunityCreateGroupPage";
import CommunityGroupPage from "./CommunityGroupPage";
import CommunityJoinRequestsPage from "./CommunityJoinRequestsPage";
import CommunityChatsPage from "./CommunityChatsPage";
import CommunityDmPage from "./CommunityDmPage";
import CommunityNewDmPage from "./CommunityNewDmPage";
import CommunityProfilePage from "./CommunityProfilePage";

function CommunityGroupSettingsRedirect() {
  const { id = "" } = useParams<{ id: string }>();
  return <Navigate to={`/app/community/groups/${id}?tab=about&admin=1`} replace />;
}

export default function CommunityAppRouter() {
  return (
    <Routes>
      <Route index element={<Navigate to="explore" replace />} />
      <Route path="explore" element={<CommunityExplorePage />} />
      <Route path="groups" element={<CommunityGroupsPage />} />
      <Route path="groups/new" element={<CommunityCreateGroupPage />} />
      <Route path="groups/:id" element={<CommunityGroupPage />} />
      <Route path="groups/:id/settings" element={<CommunityGroupSettingsRedirect />} />
      <Route path="groups/:id/requests" element={<CommunityJoinRequestsPage />} />
      <Route path="chats" element={<CommunityChatsPage />} />
      <Route path="dm/new" element={<CommunityNewDmPage />} />
      <Route path="dm/:id" element={<CommunityDmPage />} />
      <Route path="profile" element={<CommunityProfilePage />} />
      <Route path="*" element={<Navigate to="explore" replace />} />
    </Routes>
  );
}
