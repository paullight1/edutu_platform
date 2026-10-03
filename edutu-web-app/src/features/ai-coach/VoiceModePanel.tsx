import { WorkspaceText } from "../workspace/shared";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePaywall } from "../../hooks/usePaywall";
import { useProductSession, errorMessage } from "../workspace/shared";
import { RealtimeVoiceSession, type RealtimeVoiceStatus } from "./voiceSession";
export default function VoiceModePanel({
  threadId,
  onThread,
  onEnded,
  onError,
}: {
  threadId: string | null;
  onThread: (id: string) => void;
  onEnded: () => void;
  onError?: (message: string) => void;
}) {
  const { token, userId } = useProductSession();
  const { i18n } = useTranslation();
  const { billing, billingLoading } = usePaywall();
  const [status, setStatus] = useState<RealtimeVoiceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [voice, setVoice] = useState("marin");
  const [transcript, setTranscript] = useState("");
  const session = useRef<RealtimeVoiceSession | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  function stop() {
    if (!session.current) return;
    const active = session.current;
    session.current = null;
    active.close();
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    setStatus(null);
    ended.current();
  }
  useEffect(() => {
    const audioElement = audio.current;
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      const active = session.current;
      session.current = null;
      active?.close();
      if (active) ended.current();
      if (audioElement) {
        audioElement.pause();
        audioElement.srcObject = null;
      }
    };
  }, [userId]);
  async function start() {
    if (session.current || !userId) return;
    setError(null);
    setMuted(false);
    setAudioBlocked(false);
    const current = new RealtimeVoiceSession({
      userId,
      getAuthToken: token,
      threadId,
      voice,
      locale: i18n.language,
      handlers: {
        onStatus: (next) => {
          if (session.current === current) setStatus(next);
        },
        onThread,
        onUserTranscript: (text) => setTranscript(text),
        onAssistantTranscript: (text) => setTranscript(text),
        onRemoteStream: (stream) => {
          if (audio.current) {
            audio.current.srcObject = stream;
            void audio.current.play().catch(() => setAudioBlocked(true));
          }
        },
        onExpiring: () => {
          if (session.current !== current) return;
          const message =
            "This voice reservation ended. Continue when you’re ready; your conversation is saved.";
          stop();
          setError(message);
          onError?.(message);
        },
        onReconnectNeeded: () => {
          if (session.current !== current) return;
          const message =
            "Connection interrupted. Continue voice to reconnect without replaying your last question.";
          stop();
          setError(message);
          onError?.(message);
        },
        onError: (e) => {
          if (session.current !== current) return;
          const message = errorMessage(e);
          setError(message);
          stop();
          onError?.(message);
        },
      },
    });
    session.current = current;
    try {
      await current.start();
    } catch (e) {
      if (session.current !== current) return;
      const message = errorMessage(e);
      stop();
      setError(message);
      onError?.(message);
    }
  }
  return (
    <div className="voice-panel">
      <div className="feature-row">
        <div>
          <p className="feature-eyebrow">
            <WorkspaceText value="speakFreely" />
          </p>
          <h2 className="text-xl font-semibold">
            <WorkspaceText value="voiceCoach" />
          </h2>
          <p className="feature-muted">
            {status
              ? `Voice is ${status}`
              : "Your conversation continues in the same thread."}
          </p>
        </div>
        <div className="feature-actions">
          <select
            aria-label="Voice"
            className="feature-field"
            disabled={!!status}
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          >
            {["marin", "cedar", "coral", "sage"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          {status ? (
            <>
              <button
                className="feature-button secondary"
                onClick={() => {
                  session.current?.setMuted(!muted);
                  setMuted((v) => !v);
                }}
              >
                {muted ? <MicOff size={16} /> : <Mic size={16} />}{" "}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button className="feature-button secondary" onClick={stop}>
                <Square size={16} /> <WorkspaceText value="end" />
              </button>
            </>
          ) : (
            <button
              className="feature-button"
              disabled={
                billingLoading || !billing || billing.planTier === "none"
              }
              onClick={() => void start()}
            >
              <WorkspaceText value="startVoice" />
            </button>
          )}
        </div>
      </div>
      {billing?.planTier === "none" && (
        <p className="feature-muted mt-3">
          <WorkspaceText value="liveVoiceRequiresAnActivePaidPlanTextCoaching" />
        </p>
      )}
      {error && (
        <p role="alert" className="feature-error mt-3">
          {error}
        </p>
      )}
      <p role="status" className="feature-muted mt-3">
        {transcript}
      </p>
      <audio ref={audio} autoPlay aria-label="Voice coach audio" />
      {audioBlocked && (
        <button
          className="feature-button"
          onClick={() =>
            void audio.current?.play().then(() => setAudioBlocked(false))
          }
        >
          <WorkspaceText value="enableAudio" />
        </button>
      )}
    </div>
  );
}
