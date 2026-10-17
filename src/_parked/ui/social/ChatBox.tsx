import { useEffect, useRef, useState } from 'react';
import { NET } from '../../game/config';
import { sendChat } from '../../game/net/client';
import { useNet } from '../../game/store/net';

const VISIBLE_SECONDS = 12;

/** Room chat: Enter/T to type, Enter to send, Esc to cancel. Lines fade after a while. */
export function ChatBox() {
  const chat = useNet((s) => s.chat);
  const status = useNet((s) => s.status);
  const detail = useNet((s) => s.statusDetail);
  const players = useNet((s) => s.players);
  const typing = useNet((s) => s.typing);
  const setTyping = useNet((s) => s.setTyping);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open with Enter or T when not already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'Enter' || e.code === 'KeyT') {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        setTyping(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTyping]);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  // Re-render every few seconds so old lines fade out.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  const now = Date.now();
  const lines = chat.filter((m) => typing || now - m.t < VISIBLE_SECONDS * 1000).slice(-8);

  const submit = () => {
    if (!text.trim()) {
      setTyping(false);
      return;
    }
    const err = sendChat(text);
    setError(err);
    if (!err) {
      setText('');
      setTyping(false);
    }
  };

  return (
    <div className={`chatbox${typing ? ' open' : ''}`}>
      <div className="chat-status">
        {status === 'online'
          ? `${detail} · ${players.length + 1} here`
          : status === 'connecting'
            ? 'Connecting…'
            : status === 'offline'
              ? `Offline${detail ? ` — ${detail}` : ''}`
              : ''}
      </div>
      <ul className="chat-lines">
        {lines.map((m) => (
          <li key={m.id}>
            <strong>{m.name}:</strong> {m.text}
          </li>
        ))}
      </ul>
      {typing ? (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            maxLength={NET.chat.maxLength}
            placeholder="Say something… (Esc to cancel)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setText('');
                setTyping(false);
              }
            }}
            onBlur={() => !text && setTyping(false)}
          />
          <button type="submit">Send</button>
          {error && <span className="chat-error">{error}</span>}
        </form>
      ) : (
        <button className="chat-open" onClick={() => setTyping(true)}>
          Chat <kbd>T</kbd>
        </button>
      )}
    </div>
  );
}
