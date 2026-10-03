import { PaidToolGate } from "../feature-access/PaidToolGate";
import { useEffect, useRef, useState } from "react";
import { motion, useDragControls, useReducedMotion } from "framer-motion";
import { History, Maximize2, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@clerk/clerk-react";
import CoachPage from "./CoachPage";
import { COACH_NEW_CONVERSATION_EVENT, COACH_OPEN_HISTORY_EVENT } from "./coachEvents";
import { isWorkspaceFeatureEnabled } from "../workspace/release";
import "./coachSheet.css";

export default function CoachSheet({ returnTo }: { returnTo: string }) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const dragControls = useDragControls();
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const reducedMotion = useReducedMotion();
  const close = () => setClosing(true);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={`coach-sheet ${expanded ? "coach-sheet-expanded" : ""}`}
      data-keyboard-avoid
      aria-labelledby="coach-sheet-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <motion.div
        className="coach-sheet-surface"
        initial={reducedMotion ? false : { y: "100%", opacity: 0, scale: 0.96 }}
        animate={closing ? { y: "100%", opacity: 0, scale: 0.96 } : { y: 0, opacity: 1, scale: 1 }}
        onAnimationComplete={() => { if (closing) navigate(returnTo, { replace: true }); }}
        transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.08, bottom: 0.35 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 65 || info.velocity.y > 600) { if (expanded) setExpanded(false); else close(); }
          else if (info.offset.y < -45) setExpanded(true);
        }}
        style={{ transformOrigin: "bottom right" }}
      >
        <div
          className="coach-sheet-handle"
          onPointerDown={(event) => dragControls.start(event)}
        ><span aria-hidden="true" /></div>
        <header className="coach-sheet-header">
          <span className="coach-sheet-mark"><img src="/edutu-logo-mark.png" alt="" /></span>
          <h1 id="coach-sheet-title">{t("navigation.coach", { defaultValue: "AI Coach" })}</h1>
          <div className="coach-sheet-actions">
            <button type="button" aria-label={t("coach.new", { defaultValue: "New conversation" })} onClick={() => window.dispatchEvent(new Event(COACH_NEW_CONVERSATION_EVENT))}><Plus size={20} /></button>
            <button type="button" aria-label={t("coachPage.history", { defaultValue: "Conversation history" })} onClick={() => window.dispatchEvent(new Event(COACH_OPEN_HISTORY_EVENT))}><History size={19} /></button>
            <button type="button" autoFocus onClick={() => expanded ? close() : setExpanded(true)} aria-label={expanded ? "Close AI Coach" : "Expand AI Coach"}>{expanded ? <X size={21} /> : <Maximize2 size={18} />}</button>
          </div>
        </header>
        {isWorkspaceFeatureEnabled("coach") ? (
          <PaidToolGate
            feature="AI Coach"
            moduleKey="chat"
            paidByDefault
          >
            <CoachPage key={userId || "signed-out"} />
          </PaidToolGate>
        ) : (
          <p className="p-6">This feature is currently unavailable.</p>
        )}
      </motion.div>
    </dialog>
  );
}
