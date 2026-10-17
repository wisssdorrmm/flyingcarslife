import { useAdCard } from '../../game/ads/buildingAdsData';
import { BILLBOARDS } from '../../game/config';

/** Details of the advertiser that owns the building beside you (or the one you tapped). */
export function AdCard() {
  const p = useAdCard((s) => s.placement);
  if (!p) return null;
  const close = () => useAdCard.setState({ placement: null });
  // Say where by street: naming a real landmark next to "owns" could read as a real claim.
  const where = p.building.street ? `a building on ${p.building.street}` : '';
  if (!p.ad) {
    return (
      <div className="hud-adcard hud-panel">
        <button className="hud-adcard-x" onClick={close} aria-label="Close">
          ×
        </button>
        <span className="hud-adcard-kicker">AD SPACE AVAILABLE</span>
        <strong>{where ? where[0]!.toUpperCase() + where.slice(1) : 'This building'}</strong>
        <p>
          Own this building: your brand on its wall and roof, seen by every player who drives by.
        </p>
        <a href={`mailto:${BILLBOARDS.advertise}`}>{BILLBOARDS.advertise}</a>
      </div>
    );
  }
  const ad = p.ad;
  const placeholder = (t: string) => t.startsWith('PLACEHOLDER');
  return (
    <div className="hud-adcard hud-panel" style={{ borderColor: ad.colors.accent }}>
      <button className="hud-adcard-x" onClick={close} aria-label="Close">
        ×
      </button>
      <span className="hud-adcard-kicker">
        SPONSORED{where ? ` · OWNS ${where.toUpperCase()}` : ''}
      </span>
      <strong style={{ color: ad.colors.accent }}>{ad.brand}</strong>
      {!placeholder(ad.category) && <span className="hud-adcard-cat">{ad.category}</span>}
      <em>{ad.tagline}</em>
      {!placeholder(ad.description) && <p>{ad.description}</p>}
      <span className="hud-adcard-links">
        {ad.website && (
          <a href={ad.website} target="_blank" rel="noopener noreferrer">
            Visit website
          </a>
        )}
        {ad.contact && <a href={`mailto:${ad.contact}`}>{ad.contact}</a>}
      </span>
    </div>
  );
}
