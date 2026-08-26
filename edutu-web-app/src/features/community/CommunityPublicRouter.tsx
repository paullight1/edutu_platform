import { Navigate, Route, Routes } from "react-router-dom";
import CommunityLandingPage from "./CommunityLandingPage";
import PublicCommunityGroupPage from "./PublicCommunityGroupPage";

export default function CommunityPublicRouter() {
  return (
    <Routes>
      <Route index element={<CommunityLandingPage />} />
      <Route path="groups/:slug" element={<PublicCommunityGroupPage />} />
      <Route path="*" element={<Navigate to="/community" replace />} />
    </Routes>
  );
}
