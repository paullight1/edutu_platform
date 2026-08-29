import { useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import CommunityExplorePage from "./CommunityExplorePage";
import CommunityGroupsPage from "./CommunityGroupsPage";
import CommunityCreateGroupPage from "./CommunityCreateGroupPage";
import CommunityGroupPage from "./CommunityGroupPage";
import CommunityPostPage from "./CommunityPostPage";
import CommunityGroupSettingsPage from "./CommunityGroupSettingsRoute";
import CommunityJoinRequestsPage from "./CommunityJoinRequestsPage";
import CommunityChatsPage from "./CommunityChatsPage";
import CommunityDmPage from "./CommunityDmPage";
import CommunityNewDmPage from "./CommunityNewDmPage";
import CommunityProfilePage from "./CommunityProfilePage";
import CommunityGroupToolsDock from "./components/CommunityGroupToolsDock";

function CommunityGroupRoute() {
  return (
    <>
      <CommunityGroupPage />
      <CommunityGroupToolsDock />
    </>
  );
}

function LegacyCommunityMessagesRedirect() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { hash, search } = useLocation();

  if (conversationId) {
    return (
      <Navigate
        to={`/app/community/dm/${encodeURIComponent(conversationId)}${search}${hash}`}
        replace
      />
    );
  }

  const params = new URLSearchParams(search);
  const userId = params.get("user");
  if (userId) {
    params.delete("user");
    params.set("userId", userId);
  }
  const query = params.toString();
  const destination = userId ? "/app/community/dm/new" : "/app/community/chats";

  return (
    <Navigate to={`${destination}${query ? `?${query}` : ""}${hash}`} replace />
  );
}

function CommunityEntryPrompt({
  onEnter,
  onBack,
}: {
  onEnter: () => void;
  onBack: () => void;
}) {
  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-entry-title"
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#fffaf4] px-5 py-10 text-[#39180f] dark:bg-surface-body dark:text-text-primary"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(244,91,22,.14),transparent_30%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,.08),transparent_26%)]"
      />
      <div className="relative w-full max-w-md text-center">
        <div className="relative mx-auto mb-3 flex h-44 w-44 items-end justify-center sm:h-52 sm:w-52">
          <div className="absolute inset-x-5 bottom-2 h-10 rounded-[50%] bg-[#f45b16]/10 blur-xl" />
          <img
            src="/mascot/edutu-profile-guide.png"
            alt="Edutu mascot welcoming you to Community"
            className="relative z-10 h-full w-full select-none object-contain drop-shadow-[0_20px_24px_rgba(74,23,13,.16)]"
            draggable={false}
          />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#d94b0f] dark:text-brand">
          Edutu Community
        </p>
        <h1
          id="community-entry-title"
          className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl"
        >
          Before you enter
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-[#765e55] dark:text-text-secondary sm:text-base sm:leading-7">
          Be respectful, follow the rules, and share information that helps
          others.
        </p>
        <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={onBack}
            className="order-2 inline-flex h-12 items-center justify-center rounded-2xl border border-[#ecd2c2] bg-white px-5 text-sm font-bold text-[#765e55] transition hover:border-[#f45b16]/35 hover:text-[#d94b0f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 active:scale-[0.98] dark:border-subtle dark:bg-surface-layer dark:text-text-secondary sm:order-1"
          >
            Go back
          </button>
          <button
            type="button"
            autoFocus
            onClick={onEnter}
            className="order-1 inline-flex h-12 items-center justify-center rounded-2xl bg-[#f45b16] px-5 text-sm font-extrabold text-white shadow-[0_14px_30px_-18px_rgba(244,91,22,.9)] transition hover:-translate-y-0.5 hover:bg-[#d94b0f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16] focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98] sm:order-2"
          >
            Enter community
          </button>
        </div>
      </div>
    </main>
  );
}

export default function CommunityAppRouter() {
  const navigate = useNavigate();
  const [hasEntered, setHasEntered] = useState(false);

  if (!hasEntered) {
    return (
      <CommunityEntryPrompt
        onEnter={() => setHasEntered(true)}
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <Routes>
      <Route index element={<Navigate to="explore" replace />} />
      <Route path="explore" element={<CommunityExplorePage />} />
      <Route path="groups" element={<CommunityGroupsPage />} />
      <Route path="groups/new" element={<CommunityCreateGroupPage />} />
      <Route path="groups/:id" element={<CommunityGroupRoute />} />
      <Route path="groups/:id/posts/:postId" element={<CommunityPostPage />} />
      <Route
        path="groups/:id/settings"
        element={<CommunityGroupSettingsPage />}
      />
      <Route
        path="groups/:id/requests"
        element={<CommunityJoinRequestsPage />}
      />
      <Route path="chats" element={<CommunityChatsPage />} />
      <Route path="messages" element={<LegacyCommunityMessagesRedirect />} />
      <Route
        path="messages/:conversationId"
        element={<LegacyCommunityMessagesRedirect />}
      />
      <Route path="dm/new" element={<CommunityNewDmPage />} />
      <Route path="dm/:id" element={<CommunityDmPage />} />
      <Route path="profile" element={<CommunityProfilePage />} />
      <Route path="*" element={<Navigate to="explore" replace />} />
    </Routes>
  );
}
