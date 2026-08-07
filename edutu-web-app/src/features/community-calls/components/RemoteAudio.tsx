import { useEffect, useRef } from "react";

export function RemoteAudio({
  stream,
  label,
}: {
  stream: MediaStream;
  label: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      aria-label={label}
      className="sr-only"
    />
  );
}
