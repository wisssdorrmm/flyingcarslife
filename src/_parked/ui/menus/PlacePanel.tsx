import { useEffect, useState } from 'react';
import { BODY } from '../../game/config';
import { placeById } from '../../game/places/placement';
import type { PlaceAction } from '../../game/places/catalog';
import { useGame } from '../../game/store/game';
import { bmiBand, bmiOf, useLife, type Effect } from '../../game/store/life';

function effectChips(e: Effect | undefined): string[] {
  if (!e) return [];
  const out: string[] = [];
  if (e.minutes)
    out.push(e.minutes >= 60 ? `${+(e.minutes / 60).toFixed(1)} h` : `${e.minutes} min`);
  if (e.kcal) out.push(`${e.kcal} kcal`);
  if (e.burn) out.push(`burns ${e.burn} kcal`);
  if (e.fullness && e.fullness > 0) out.push(`+${e.fullness} food`);
  if (e.energyTo) out.push('full energy');
  if (e.energy) out.push(`${e.energy > 0 ? '+' : ''}${e.energy} energy`);
  if (e.mood) out.push(`${e.mood > 0 ? '+' : ''}${e.mood} mood`);
  if (e.fitness) out.push(`+${e.fitness} fitness`);
  if (e.education) out.push(`+${e.education} education`);
  return out;
}

const BAND_ADVICE = {
  underweight:
    'You are underweight. Eat more often — balanced meals with protein — and avoid skipping food.',
  healthy:
    'Your weight is in the healthy range. Keep balancing what you eat with how active you are.',
  overweight:
    'You are overweight. Swap burgers and shakes for salads and soup, walk instead of driving, and try the gym.',
  obese:
    'Your BMI is in the obese range, which slows you down and drains your energy. Cut back on high-calorie food and do cardio regularly.',
} as const;

function HealthReport() {
  const weight = useLife((s) => s.weightKg);
  const fitness = useLife((s) => s.fitness);
  const kcalToday = useLife((s) => s.kcalToday);
  const bmi = bmiOf(weight);
  const band = bmiBand(bmi);
  return (
    <div className="health-report">
      <h3>Doctor's report</h3>
      <dl>
        <dt>Weight</dt>
        <dd>{weight.toFixed(1)} kg</dd>
        <dt>Height</dt>
        <dd>{BODY.heightM.toFixed(2)} m</dd>
        <dt>BMI</dt>
        <dd className={`band-${band}`}>
          {bmi.toFixed(1)} · {band}
        </dd>
        <dt>Fitness</dt>
        <dd>{Math.round(fitness)} / 100</dd>
        <dt>Eaten today</dt>
        <dd>{Math.round(kcalToday)} kcal</dd>
      </dl>
      <p>{BAND_ADVICE[band]}</p>
    </div>
  );
}

/** Menu for the place the player walked into: its actions, prices and effects. */
export function PlacePanel() {
  const placeId = useGame((s) => s.openPlaceId);
  const close = useGame((s) => s.closePlace);
  const money = useLife((s) => s.money);
  const [report, setReport] = useState(false);
  const place = placeId ? placeById(placeId) : undefined;

  useEffect(() => setReport(false), [placeId]);
  useEffect(() => {
    if (!placeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyE') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placeId, close]);

  if (!place) return null;

  const run = (a: PlaceAction) => {
    if (a.comingSoon) return;
    if (a.effect && !useLife.getState().apply(a.effect, a.label)) return;
    if (!a.effect) useLife.getState().toast(a.description);
    if (a.report) setReport(true);
  };

  return (
    <div className="panel-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="place-panel" role="dialog" aria-label={place.name}>
        <header style={{ background: place.sign.background, color: place.sign.text }}>
          <div>
            <h2>{place.name}</h2>
            <p>{place.tagline}</p>
          </div>
          <button className="panel-close" onClick={close} aria-label="Leave">
            ×
          </button>
        </header>
        <div className="place-body">
          <div className="place-wallet">Cash: ${money.toFixed(0)}</div>
          <ul className="place-actions">
            {place.actions.map((a) => {
              const cost = a.effect?.cost ?? 0;
              const broke = cost > money;
              return (
                <li key={a.id}>
                  <div className="action-text">
                    <strong>{a.label}</strong>
                    <span>{a.description}</span>
                    <span className="chips">
                      {effectChips(a.effect).map((c) => (
                        <em key={c}>{c}</em>
                      ))}
                      {a.comingSoon && <em className="soon">Coming in {a.comingSoon}</em>}
                    </span>
                  </div>
                  <button
                    className="action-btn"
                    disabled={!!a.comingSoon || broke}
                    onClick={() => run(a)}
                    title={broke ? 'Not enough money' : undefined}
                  >
                    {a.comingSoon ? 'Soon' : cost ? `$${cost}` : 'Go'}
                  </button>
                </li>
              );
            })}
          </ul>
          {report && <HealthReport />}
          <p className="panel-hint">Esc or E to leave</p>
        </div>
      </div>
    </div>
  );
}
