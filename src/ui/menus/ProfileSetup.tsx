import { useEffect, useState } from 'react';
import { startNet } from '../../game/net/client';
import { validateName } from '../../game/net/moderation';
import {
  loadProfile,
  NAME_COLORS,
  newProfileId,
  saveProfile,
  TITLES,
} from '../../game/net/profile';

/**
 * First-launch screen: pick the name and title other players will see above your head. Returning
 * players skip straight in (their profile is saved on the device).
 */
export function ProfileSetup() {
  const [needed, setNeeded] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState<string>(TITLES[0]);
  const [color, setColor] = useState(NAME_COLORS[0]!);
  const error = name ? validateName(name) : null;

  useEffect(() => {
    const saved = loadProfile();
    const params = new URLSearchParams(window.location.search);
    if (saved) void startNet(saved);
    else if (params.has('debug') && params.has('guest')) {
      // Testing shortcut: join as a throwaway guest without the name screen.
      const n = Math.floor(Math.random() * 9000 + 1000);
      void startNet({
        id: newProfileId(),
        name: `Guest ${n}`,
        title: TITLES[0],
        color: NAME_COLORS[0]!,
      });
    } else setNeeded(true);
  }, []);

  if (!needed) return null;

  const play = () => {
    if (validateName(name)) return;
    const profile = { id: newProfileId(), name: name.trim(), title, color };
    saveProfile(profile);
    setNeeded(false);
    void startNet(profile);
  };

  return (
    <div className="panel-backdrop profile-backdrop">
      <form
        className="profile-card"
        onSubmit={(e) => {
          e.preventDefault();
          play();
        }}
      >
        <h2>Welcome to Harbor City</h2>
        <p>Other players will see your name and title above your head.</p>
        <label>
          Name
          <input
            autoFocus
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </label>
        {error && <span className="profile-error">{error}</span>}
        <span className="profile-label">Title</span>
        <div className="chip-row">
          {TITLES.map((t) => (
            <button
              type="button"
              key={t}
              className={`chip${t === title ? ' active' : ''}`}
              onClick={() => setTitle(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="profile-label">Name tag color</span>
        <div className="chip-row">
          {NAME_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              aria-label={`Color ${c}`}
              className={`swatch${c === color ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="profile-preview">
          <strong style={{ color }}>{name.trim() || 'Your name'}</strong>
          <span>{title}</span>
        </div>
        <button className="action-btn profile-play" disabled={!name || !!error}>
          Play
        </button>
      </form>
    </div>
  );
}
