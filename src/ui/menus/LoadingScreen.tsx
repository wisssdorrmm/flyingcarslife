import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

/** Full-screen loader driven by three's loading manager; fades out once everything is in. */
export function LoadingScreen() {
  const { active, progress, loaded, total } = useProgress();
  const [hidden, setHidden] = useState(false);
  const done = !active && progress >= 100;

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setHidden(true), 600);
    return () => window.clearTimeout(t);
  }, [done]);

  if (hidden) return null;
  return (
    <div
      className={`loading-screen${done ? ' done' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
    >
      <div className="loading-title">Flying Cars Life</div>
      <div className="loading-sub">Harbor City</div>
      <div className="loading-bar">
        <div className="loading-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="loading-count">
        {Math.round(progress)}% · {loaded}/{Math.max(total, loaded)} files
      </div>
    </div>
  );
}
