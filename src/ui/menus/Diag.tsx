import { useEffect, useState } from 'react';
import { useSettings } from '../../game/store/settings';
import { currentPose } from '../../game/store/nav';
import { glStatus } from '../../game/world/glWatch';

const showDiag = new URLSearchParams(window.location.search).has('diag');
const errors: string[] = [];
if (showDiag) {
  window.addEventListener('error', (e) => errors.push(String(e.message).slice(0, 120)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason).slice(0, 120)));
}

/** The GPU dropped the 3D view even at Low quality: say so instead of a frozen white screen. */
function LostMessage() {
  return (
    <div className="menu-backdrop">
      <div className="menu-card">
        <h2>Your phone ran out of graphics memory</h2>
        <p className="menu-sub">
          Close other apps and browser tabs, then reload. Low quality is already on.
        </p>
        <div className="menu-actions">
          <button className="menu-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

/** `?diag`: what this device reports, to debug phones we can't test on. */
function DiagPanel() {
  const tier = useSettings((s) => s.quality.tier);
  const [, tick] = useState(0);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const loop = () => {
      frames++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const id = window.setInterval(() => {
      setFps(frames);
      frames = 0;
      tick((x) => x + 1);
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, []);
  const pose = currentPose();
  return (
    <pre
      style={{
        position: 'absolute',
        left: 8,
        top: 60,
        zIndex: 40,
        maxWidth: '92vw',
        whiteSpace: 'pre-wrap',
        padding: 8,
        font: '11px/1.4 monospace',
        color: '#fff',
        background: 'rgb(0 0 0 / 0.75)',
        borderRadius: 8,
        pointerEvents: 'none',
      }}
    >
      {[
        `gpu: ${glStatus.renderer}`,
        `webgl: ${glStatus.webgl}`,
        `tier: ${tier}  fps: ${fps}  lost: ${glStatus.lost}`,
        `screen: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
        `car: ${pose ? `${pose.x.toFixed(0)}, ${pose.z.toFixed(0)}` : 'none'}`,
        `ua: ${navigator.userAgent.slice(0, 110)}`,
        ...errors.slice(-4).map((e) => `err: ${e}`),
      ].join('\n')}
    </pre>
  );
}

export function Diag() {
  const [lost, setLost] = useState(false);
  useEffect(() => {
    const on = () => setLost(true);
    window.addEventListener('fcl:gl-lost', on);
    return () => window.removeEventListener('fcl:gl-lost', on);
  }, []);
  return (
    <>
      {lost && <LostMessage />}
      {showDiag && <DiagPanel />}
    </>
  );
}
