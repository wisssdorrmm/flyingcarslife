import { useWanted } from '../../game/store/wanted';

/** Wanted stars (hidden at zero) and the pursuit banner. */
export function WantedStars() {
  const stars = useWanted((s) => s.stars);
  const pursuit = useWanted((s) => s.pursuit);
  const reward = useWanted((s) => s.evadeReward);
  const escaping = useWanted((s) => s.escape > 0);
  if (stars <= 0) return null;
  return (
    <>
      <div
        className={`hud-wanted hud-panel${escaping ? ' flashing' : ''}`}
        aria-label={`Wanted level ${stars}`}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`hud-star${i <= stars ? ' on' : ''}`}>
            ★
          </span>
        ))}
      </div>
      {pursuit && (
        <div className="hud-pursuit">
          Police in pursuit — evade <strong>+${reward.toLocaleString()}</strong>
        </div>
      )}
    </>
  );
}
