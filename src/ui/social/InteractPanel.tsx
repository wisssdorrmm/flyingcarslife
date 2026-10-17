import { useEffect } from 'react';
import { requestSocial, respondSocial } from '../../game/net/social';
import { EMOTES } from '../../game/player/emotes';
import { playEmote, playerState } from '../../game/player/playerState';
import { remoteSnapshots } from '../../game/net/client';
import { useLife } from '../../game/store/life';
import { useNet } from '../../game/store/net';
import { SOCIAL_LABEL, useSocial, type SocialAction } from '../../game/store/social';

/** Prompt near another player, the interaction menu (X), and incoming request cards (Y / N). */
export function SocialUi() {
  const target = useSocial((s) => s.target);
  const open = useSocial((s) => s.panelOpen);
  const setOpen = useSocial((s) => s.setPanelOpen);
  const incoming = useSocial((s) => s.incoming);
  const friends = useSocial((s) => s.friends);
  const players = useNet((s) => s.players);
  const who = players.find((p) => p.id === target);
  const first = incoming[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const req = useSocial.getState().incoming[0];
      if (req && e.code === 'KeyY') respondSocial(req.from, req.action, true);
      if (req && e.code === 'KeyN') respondSocial(req.from, req.action, false);
      if (e.code === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const ask = (action: SocialAction) => {
    if (!target) return;
    requestSocial(target, action);
    setOpen(false);
  };
  const isFriend = !!who && friends.some((f) => f.id === who.id.split(':')[0]);

  return (
    <>
      {who && !open && (
        <div className="prompt social-prompt">
          <kbd>X</kbd> Meet {who.name}
        </div>
      )}
      {who && open && (
        <div className="interact-panel" role="dialog" aria-label={`Interact with ${who.name}`}>
          <header>
            <span className="dot" style={{ background: who.color }} />
            <div>
              <strong>{who.name}</strong>
              <em>
                {who.title}
                {isFriend ? ' · ★ Friend' : ''}
              </em>
            </div>
            <button className="panel-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>
          <div className="interact-actions">
            <button
              onClick={() => {
                const s = remoteSnapshots.get(who.id);
                const l = s?.[s.length - 1];
                if (l) playerState.faceToward = { x: l.x, z: l.z };
                playEmote('wave');
                setOpen(false);
              }}
            >
              {EMOTES.wave.icon} Wave
            </button>
            <button onClick={() => ask('highfive')}>{EMOTES.highfive.icon} High five</button>
            <button onClick={() => ask('hug')}>{EMOTES.hug.icon} Hug</button>
            <button onClick={() => ask('dance')}>{EMOTES.dance.icon} Dance together</button>
            {!isFriend && <button onClick={() => ask('friend')}>⭐ Add friend</button>}
          </div>
          <footer>
            <button onClick={() => useNet.getState().toggleMute(who.id)}>Mute</button>
            <button
              onClick={() => {
                useNet.getState().toggleBlock(who.id);
                setOpen(false);
              }}
            >
              Block
            </button>
            <button
              onClick={() => {
                useNet.getState().report(who.id);
                useLife.getState().toast(`Reported ${who.name}. Thanks — our team will review it.`);
                setOpen(false);
              }}
            >
              Report
            </button>
          </footer>
        </div>
      )}
      {first && (
        <div className="request-card" role="alertdialog">
          <span>
            <strong>{first.name}</strong> wants to {SOCIAL_LABEL[first.action]}
          </span>
          <div>
            <button
              className="accept"
              onClick={() => respondSocial(first.from, first.action, true)}
            >
              Accept <kbd>Y</kbd>
            </button>
            <button onClick={() => respondSocial(first.from, first.action, false)}>
              No thanks <kbd>N</kbd>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
