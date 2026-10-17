import { detectDevice } from '../../game/quality';
import { placeById } from '../../game/places/placement';
import { useGame } from '../../game/store/game';

const isTouch = detectDevice().isTouch || new URLSearchParams(window.location.search).has('touch');

const TEXT: Record<string, { key: string; label: string }> = {
  drive: { key: 'E', label: 'Get in' },
};

/** Context action prompt, e.g. "E Get in" near the car. Touch devices show a button instead. */
export function Prompt() {
  const prompt = useGame((s) => s.prompt);
  const mode = useGame((s) => s.mode);
  const menuOpen = useGame((s) => s.openPlaceId);
  if (isTouch || menuOpen) return null;
  if (mode === 'driving') {
    return (
      <div className="prompt subtle">
        <kbd>E</kbd> Get out · <kbd>Space</kbd> Handbrake
      </div>
    );
  }
  if (prompt?.startsWith('place:')) {
    const place = placeById(prompt.slice(6));
    if (!place) return null;
    return (
      <div className="prompt">
        <kbd>E</kbd> Enter {place.name.replace(/—.*$/, '').trim()}
      </div>
    );
  }
  const t = prompt ? TEXT[prompt] : undefined;
  if (!t) return null;
  return (
    <div className="prompt">
      <kbd>{t.key}</kbd> {t.label}
    </div>
  );
}
