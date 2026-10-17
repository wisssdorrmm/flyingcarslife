import { bmiBand, bmiOf, clockLabel, useLife } from '../../game/store/life';

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="stat" title={`${label} ${Math.round(value)}%`}>
      <span className="stat-label">{label}</span>
      <div className="stat-bar">
        <div className={`stat-fill ${value < 20 ? 'low' : tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Money, clock, needs and body readout (updates twice a second from the life system). */
export function StatusHud() {
  const money = useLife((s) => s.money);
  const minutes = useLife((s) => s.minutes);
  const fullness = useLife((s) => s.fullness);
  const energy = useLife((s) => s.energy);
  const mood = useLife((s) => s.mood);
  const weight = useLife((s) => s.weightKg);
  const bmi = bmiOf(weight);
  const band = bmiBand(bmi);
  return (
    <div className="status-hud" aria-label="Status">
      <div className="status-top">
        <span className="money">${money.toFixed(0)}</span>
        <span className="clock">{clockLabel(minutes)}</span>
      </div>
      <Bar label="Food" value={fullness} tone="food" />
      <Bar label="Energy" value={energy} tone="energy" />
      <Bar label="Mood" value={mood} tone="mood" />
      <div className="body">
        {weight.toFixed(1)} kg · BMI {bmi.toFixed(1)} ·{' '}
        <span className={`band band-${band}`}>{band}</span>
      </div>
    </div>
  );
}

/** Short confirmations ("Caramel latte · −$5 · +190 kcal"). */
export function Toasts() {
  const toasts = useLife((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
