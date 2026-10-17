import { useEffect } from 'react';
import { GARAGE } from '../../game/config';
import { useCareer } from '../../game/store/career';
import { usePlayerCar } from '../../game/store/playerCar';
import { toast } from '../../game/store/toasts';
import { useUi } from '../../game/store/ui';
import { vehicleState } from '../../game/vehicles/vehicleState';

type CarDef = (typeof GARAGE.cars)[number];

/** Swap the player into a garage car where they stand (stopped, on the ground). */
function driveCar(def: CarDef, paint: string, wheels: string): boolean {
  const active = vehicleState.active;
  const current = usePlayerCar.getState().car;
  if (!active || !current || active.flying || Math.abs(active.speed) > 2) return false;
  const p = active.object.getWorldPosition(active.object.position.clone());
  const q = active.object.getWorldQuaternion(active.object.quaternion.clone());
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  usePlayerCar.getState().setCar({
    carId: def.id,
    model: def.model,
    paint,
    wheels,
    canFly: def.canFly,
    position: [p.x, p.y + 0.4, p.z],
    heading: Math.atan2(fx, fz),
    speed: 0,
  });
  return true;
}

/** Garage (from the menu): buy cars, switch cars, paint and wheels. Flying cars are the top tier. */
export function Garage() {
  const open = useUi((s) => s.garageOpen);
  const setOpen = useUi((s) => s.setGarageOpen);
  const career = useCareer();
  const currentId = usePlayerCar((s) => s.car?.carId ?? 'flying-car-ev');
  const look = career.looks[currentId];
  const paint = look?.paint || usePlayerCar.getState().car?.paint || GARAGE.paints[0];
  const wheels = look?.wheels ?? 'stock';
  if (!open) return null;

  const apply = (id: string, p: string, w: string) => {
    const def = GARAGE.cars.find((c) => c.id === id)!;
    if (!driveCar(def, p, w)) toast('Stop the car (on the ground) to change it', 'warn');
  };

  return (
    <div className="menu-backdrop" role="dialog" aria-label="Garage">
      <div className="menu-card">
        <h2>Garage</h2>
        <p className="menu-sub">Cash ${career.cash.toLocaleString()}</p>
        <h3>Cars</h3>
        {GARAGE.cars.map((c) => {
          const owned = career.cars.includes(c.id);
          return (
            <div key={c.id} className="menu-car">
              <div>
                <strong>{c.name}</strong>
                <span>
                  {c.canFly ? `Flying car · ${c.flightSeconds} s flights` : 'Road car'} · power{' '}
                  {Math.round(c.power * 100)}%
                </span>
              </div>
              {owned ? (
                <button
                  className={c.id === currentId ? 'on' : ''}
                  onClick={() => {
                    career.selectCar(c.id);
                    const l = career.looks[c.id];
                    apply(c.id, l?.paint || GARAGE.paints[0], l?.wheels ?? 'stock');
                  }}
                >
                  {c.id === currentId ? 'Driving' : 'Drive'}
                </button>
              ) : (
                <button
                  disabled={career.cash < c.price}
                  onClick={() => {
                    if (career.buyCar(c.id, c.price)) toast(`Bought the ${c.name}!`, 'reward');
                  }}
                >
                  Buy ${c.price.toLocaleString()}
                </button>
              )}
            </div>
          );
        })}
        <h3>Paint · ${GARAGE.paintPrice}</h3>
        <div className="menu-swatches">
          {GARAGE.paints.map((p) => (
            <button
              key={p}
              className={`menu-swatch${p === paint ? ' on' : ''}`}
              style={{ background: p }}
              aria-label={`Paint ${p}`}
              onClick={() => {
                if (p === paint || !career.spend(GARAGE.paintPrice)) return;
                career.setLook(currentId, { paint: p, wheels });
                apply(currentId, p, wheels);
              }}
            />
          ))}
        </div>
        <h3>Wheels · ${GARAGE.wheelPrice}</h3>
        <div className="menu-row">
          {GARAGE.wheels.map((w) => (
            <button
              key={w.id}
              className={w.id === wheels ? 'on' : ''}
              onClick={() => {
                if (w.id === wheels || !career.spend(GARAGE.wheelPrice)) return;
                career.setLook(currentId, { paint, wheels: w.id });
                apply(currentId, paint, w.id);
              }}
            >
              {w.name}
            </button>
          ))}
        </div>
        <div className="menu-actions" style={{ marginTop: 16 }}>
          <button className="menu-primary" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** "New car affordable" toasts as cash grows. */
export function GarageUnlocks() {
  useEffect(() => {
    const told = new Set<string>();
    return useCareer.subscribe((s) => {
      for (const c of GARAGE.cars) {
        if (c.price > 0 && !s.cars.includes(c.id) && s.cash >= c.price && !told.has(c.id)) {
          told.add(c.id);
          toast(`You can afford the ${c.name}: open the Garage`, 'reward');
        }
      }
    });
  }, []);
  return null;
}
