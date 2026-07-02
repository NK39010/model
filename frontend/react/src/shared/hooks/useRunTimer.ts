import { useCallback, useEffect, useState } from "react";

export function useRunTimer(isRunning: boolean) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startTimer = useCallback(() => {
    setStartedAt(Date.now());
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (!isRunning || startedAt === null) return undefined;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, startedAt]);

  return { elapsedSeconds, startTimer };
}

export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
