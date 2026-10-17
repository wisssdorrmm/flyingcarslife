import { useToasts } from '../../game/store/toasts';

/** Short notifications from store/toasts (cash, new streets, police). */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="hud-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`hud-toast toast-${t.tone ?? 'info'}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
