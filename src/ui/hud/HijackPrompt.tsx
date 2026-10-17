import { useHijack } from '../../game/vehicles/hijackState';

/** "E  Hijack car" / "E  Get in your flying car" when there's a car to take (desktop). */
export function HijackPrompt({ touch }: { touch: boolean }) {
  const target = useHijack((s) => s.target);
  if (!target || touch) return null;
  return (
    <div className="hud-prompt hud-panel">
      <kbd>E</kbd>
      {target.label}
    </div>
  );
}
