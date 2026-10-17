import { useEffect, useState } from 'react';
import { EMOTES } from '../../game/player/emotes';
import { playEmote } from '../../game/player/playerState';
import { useGame } from '../../game/store/game';
import type { EmoteName } from '../../game/net/types';

const ORDER = Object.keys(EMOTES) as EmoteName[];

/** G (or the Emote button) opens the emote menu; 1–7 or a click plays one. */
export function EmoteMenu() {
  const [open, setOpen] = useState(false);
  const mode = useGame((s) => s.mode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyG') setOpen((o) => !o);
      if (e.code === 'Escape') setOpen(false);
      const n = Number(e.key);
      if (open && n >= 1 && n <= ORDER.length) {
        playEmote(ORDER[n - 1]!);
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('fcl:emote-menu', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('fcl:emote-menu', onOpen);
    };
  }, [open]);

  if (!open || mode !== 'onFoot') return null;
  return (
    <div className="emote-menu" role="menu" aria-label="Emotes">
      {ORDER.map((name, i) => (
        <button
          key={name}
          role="menuitem"
          onPointerDown={(e) => {
            e.stopPropagation();
            playEmote(name);
            setOpen(false);
          }}
        >
          <span className="emote-icon">{EMOTES[name].icon}</span>
          <span>{EMOTES[name].label}</span>
          <kbd>{i + 1}</kbd>
        </button>
      ))}
    </div>
  );
}
