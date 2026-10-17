import { useEffect } from 'react';
import { missionFor } from '../../game/missions/levels';
import { teleportToStart } from '../../game/missions/teleport';
import { useMissions, type ActiveMission } from '../../game/missions/store';
import { resolvePlace } from '../../game/missions/places';
import { useCity } from '../../game/city/cityData';
import { useNav } from '../../game/store/nav';
import './missions.css';

const money = (n: number) => `$${n.toLocaleString()}`;

function clock(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span className="ms-stars" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Top-right: opens the mission ladder. */
function MissionButton() {
  const unlocked = useMissions((s) => s.progress.unlocked);
  const running = useMissions((s) => s.active?.status === 'running');
  const open = useMissions((s) => s.setListOpen);
  if (running) return null;
  return (
    <button className="ms-open" onClick={() => open(true)}>
      <span className="ms-open-kicker">MISSIONS</span>
      <span className="ms-open-level">Level {unlocked}</span>
    </button>
  );
}

/** Top-center while a mission runs: objective, timer, hold progress and armor. */
function Objective({ a }: { a: ActiveMission }) {
  const urgent = a.timer !== null && a.timer <= 10;
  return (
    <div className="ms-objective">
      <div className="ms-obj-head">
        <span>
          LEVEL {a.def.level} · {a.def.title.toUpperCase()}
        </span>
        <span>
          {a.stage + 1}/{a.def.stages.length}
        </span>
      </div>
      <div className="ms-obj-main">
        {a.target && (
          <span className="ms-dir">
            <svg viewBox="0 0 24 24" style={{ transform: `rotate(${a.target.angle}rad)` }}>
              <path d="M12 2 L20 20 L12 15 L4 20 Z" fill="currentColor" />
            </svg>
            <small>
              {a.target.dist < 1000
                ? `${Math.round(a.target.dist)} m`
                : `${(a.target.dist / 1000).toFixed(1)} km`}
            </small>
          </span>
        )}
        <div className="ms-obj-text">{a.objective}</div>
      </div>
      {(a.timer !== null || a.detail) && (
        <div className="ms-obj-row">
          {a.detail && <span className="ms-obj-detail">{a.detail}</span>}
          {a.timer !== null && (
            <span className={`ms-timer${urgent ? ' urgent' : ''}`}>{clock(a.timer)}</span>
          )}
        </div>
      )}
      {a.hold !== null && (
        <div className="ms-bar ms-hold">
          <i style={{ width: `${Math.round(a.hold * 100)}%` }} />
        </div>
      )}
      <div className="ms-armor">
        <span>ARMOR</span>
        <div className="ms-bar">
          <i
            className={a.armor / a.armorMax < 0.3 ? 'low' : ''}
            style={{ width: `${Math.round((a.armor / a.armorMax) * 100)}%` }}
          />
        </div>
      </div>
      <button className="ms-abort" onClick={() => useMissions.getState().abort()}>
        Quit mission
      </button>
    </div>
  );
}

function Briefing({ a }: { a: ActiveMission }) {
  const { def } = a;
  const replay = !!useMissions.getState().progress.best[def.level];
  return (
    <div className="menu-backdrop ms-backdrop">
      <div className="menu-card ms-card">
        <div className="ms-kicker">LEVEL {def.level}</div>
        <h2>{def.title}</h2>
        <p className="ms-tagline">{def.tagline}</p>
        <p className="ms-briefing">{def.briefing}</p>
        <ul className="ms-steps">
          {def.stages.map((s, i) => (
            <li key={i}>
              {s.text}
              {s.heat && <span className="ms-heat"> {'★'.repeat(s.heat.stars)}</span>}
              {s.heat?.fire && <span className="ms-fire"> · police shoot</span>}
            </li>
          ))}
        </ul>
        <div className="ms-meta">
          <span>Reward {money(replay ? Math.round(def.reward * 0.35) : def.reward)}</span>
          <span>Armor {def.armor}</span>
        </div>
        <div className="menu-actions">
          <button className="menu-primary" autoFocus onClick={() => useMissions.getState().begin()}>
            Start mission (E)
          </button>
          <button onClick={() => useMissions.getState().close()}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function Result({ a }: { a: ActiveMission }) {
  const passed = a.status === 'passed';
  const st = useMissions.getState();
  const next = () => {
    const level = a.def.level + 1;
    st.close();
    st.select(level);
    teleportToStart(missionFor(level));
    st.brief(level);
  };
  const retry = () => {
    teleportToStart(a.def);
    st.retry();
  };
  return (
    <div className="menu-backdrop ms-backdrop">
      <div className={`menu-card ms-card ms-result ${passed ? 'pass' : 'fail'}`}>
        <div className="ms-kicker">LEVEL {a.def.level}</div>
        <h2>{passed ? 'MISSION PASSED' : 'MISSION FAILED'}</h2>
        {passed ? (
          <>
            <Stars n={a.rating} />
            <p className="ms-reward">+{money(a.reward)}</p>
            <p className="menu-sub">
              {a.rating < 3
                ? 'Faster and with less damage for three stars.'
                : 'Flawless. On to the next one.'}
            </p>
          </>
        ) : (
          <p className="ms-reason">{a.failReason}</p>
        )}
        <div className="menu-actions">
          {passed ? (
            <button className="menu-primary" autoFocus onClick={next}>
              Next level (E)
            </button>
          ) : (
            <button className="menu-primary" autoFocus onClick={retry}>
              Retry (E)
            </button>
          )}
          {passed && <button onClick={retry}>Replay</button>}
          <button onClick={() => st.close()}>Free roam</button>
        </div>
      </div>
    </div>
  );
}

/** The ladder: every level, locks, best ratings; play now or set the GPS to its start. */
function MissionList() {
  const { progress, setListOpen } = useMissions();
  const city = useCity((s) => s.city);
  const shown = Math.max(progress.unlocked + 2, 10);
  const play = (level: number) => {
    const def = missionFor(level);
    useMissions.getState().select(level);
    teleportToStart(def);
    useMissions.getState().brief(level);
  };
  const gps = (level: number) => {
    const def = missionFor(level);
    useMissions.getState().select(level);
    setListOpen(false);
    if (!city) return;
    const s = resolvePlace(city, def.start);
    useNav.getState().setWaypoint({ x: s.x, z: s.z, label: `Mission: ${def.title}` });
  };
  return (
    <div className="menu-backdrop ms-backdrop" onClick={() => setListOpen(false)}>
      <div className="menu-card ms-card ms-list" onClick={(e) => e.stopPropagation()}>
        <h2>Missions</h2>
        <p className="menu-sub">
          Each level is harder than the last. Earned so far: {money(progress.earned)}
        </p>
        <ol>
          {Array.from({ length: shown }, (_, i) => {
            const level = i + 1;
            const def = missionFor(level);
            const locked = level > progress.unlocked;
            const best = progress.best[level] ?? 0;
            return (
              <li key={level} className={locked ? 'locked' : ''}>
                <div className="ms-row-main">
                  <span className="ms-row-level">{level}</span>
                  <span className="ms-row-text">
                    <b>{locked ? 'Locked' : def.title}</b>
                    <small>{locked ? `Finish level ${level - 1} to unlock` : def.tagline}</small>
                  </span>
                  {!locked && <Stars n={best} />}
                </div>
                {!locked && (
                  <div className="ms-row-actions">
                    <span className="ms-row-reward">{money(def.reward)}</span>
                    <button onClick={() => gps(level)}>Drive there</button>
                    <button className="menu-primary" onClick={() => play(level)}>
                      Play
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="menu-actions">
          <button onClick={() => setListOpen(false)}>Close</button>
        </div>
      </div>
    </div>
  );
}

/** Mission HUD and screens (mounted beside the driving HUD). */
export function MissionUi() {
  const active = useMissions((s) => s.active);
  const listOpen = useMissions((s) => s.listOpen);

  // E / Enter confirms whatever card is up (start, next level, retry).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' && e.code !== 'Enter') return;
      const st = useMissions.getState();
      const a = st.active;
      if (!a || a.status === 'running') return;
      e.preventDefault();
      if (a.status === 'briefing') st.begin();
      else if (a.status === 'passed') {
        const level = a.def.level + 1;
        st.close();
        st.select(level);
        teleportToStart(missionFor(level));
        st.brief(level);
      } else {
        teleportToStart(a.def);
        st.retry();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ms-layer">
      {!active && !listOpen && <MissionButton />}
      {active?.status === 'running' && <Objective a={active} />}
      {active?.status === 'briefing' && <Briefing a={active} />}
      {(active?.status === 'passed' || active?.status === 'failed') && <Result a={active} />}
      {listOpen && <MissionList />}
    </div>
  );
}
