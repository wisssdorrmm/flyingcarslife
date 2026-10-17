import { Component, type ReactNode } from 'react';

const RELOADED = 'fcl.reloadedAfterError';

/**
 * Never leave a blank screen: if the game fails to load (e.g. an old tab asking for files a new
 * deploy replaced, or WebGL unavailable), reload once automatically, then show what went wrong.
 */
export class LoadError extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    try {
      if (!sessionStorage.getItem(RELOADED)) {
        sessionStorage.setItem(RELOADED, '1');
        window.location.reload();
      }
    } catch {
      // Storage blocked: just show the message.
    }
    console.error(error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="menu-backdrop">
        <div className="menu-card">
          <h2>The game couldn&apos;t start</h2>
          <p className="menu-sub">
            {/WebGL|context/i.test(this.state.error.message)
              ? 'Your browser has 3D graphics (WebGL) turned off or unsupported. Try Chrome or Safari.'
              : 'A new version may have been published while this page was open.'}
          </p>
          <div className="menu-actions">
            <button
              className="menu-primary"
              onClick={() => {
                try {
                  sessionStorage.removeItem(RELOADED);
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
