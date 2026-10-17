import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { remoteSnapshots } from '../../game/net/client';
import { currentPose } from '../../game/store/nav';
import { useNet } from '../../game/store/net';
import { useLife } from '../../game/store/life';
import { formatDistance } from '../map/format';

const tmp = new THREE.Vector2();

/** Who's in this city: hold Tab (or tap Players). Mute, block or report anyone. */
export function PlayerList() {
  const open = useNet((s) => s.listOpen);
  const setOpen = useNet((s) => s.setListOpen);
  const players = useNet((s) => s.players);
  const muted = useNet((s) => s.muted);
  const blocked = useNet((s) => s.blocked);
  const reported = useNet((s) => s.reported);
  const profile = useNet((s) => s.profile);
  const [, tick] = useState(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setOpen(!useNet.getState().listOpen);
      }
      if (e.code === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;
  const me = currentPose();
  const distanceTo = (id: string) => {
    const snaps = remoteSnapshots.get(id);
    const last = snaps?.[snaps.length - 1];
    if (!me || !last) return null;
    return tmp.set(last.x - me.x, last.z - me.z).length();
  };
  const net = useNet.getState();

  return (
    <div
      className="panel-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="player-list" role="dialog" aria-label="Players">
        <header>
          <div>
            <h2>Players in this city</h2>
            <p>
              {players.length + 1} here · you are {profile?.name}
            </p>
          </div>
          <button className="panel-close" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
        </header>
        {players.length === 0 ? (
          <p className="empty">
            Nobody else is here yet. Open the game in another tab to test, or invite a friend.
          </p>
        ) : (
          <ul>
            {players.map((p) => {
              const d = distanceTo(p.id);
              return (
                <li key={p.id} className={blocked.has(p.id) ? 'blocked' : ''}>
                  <span className="dot" style={{ background: p.color }} />
                  <span className="who">
                    <strong>{p.name}</strong>
                    <em>
                      {p.title}
                      {d !== null ? ` · ${formatDistance(d)} away` : ''}
                    </em>
                  </span>
                  <button onClick={() => net.toggleMute(p.id)}>
                    {muted.has(p.id) ? 'Unmute' : 'Mute'}
                  </button>
                  <button onClick={() => net.toggleBlock(p.id)}>
                    {blocked.has(p.id) ? 'Unblock' : 'Block'}
                  </button>
                  <button
                    disabled={reported.has(p.id)}
                    onClick={() => {
                      net.report(p.id);
                      useLife
                        .getState()
                        .toast(`Reported ${p.name}. Thanks — our team will review it.`);
                    }}
                  >
                    {reported.has(p.id) ? 'Reported' : 'Report'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="panel-hint">
          Blocked players disappear for you and can't chat with you. Tab or Esc to close.
        </p>
      </div>
    </div>
  );
}
