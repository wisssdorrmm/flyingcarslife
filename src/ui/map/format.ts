import { HUD_UNITS } from '../../game/config';

/** Distance for the HUD: feet/miles on the US setting, meters/km otherwise. */
export function formatDistance(m: number): string {
  if (HUD_UNITS === 'mph') {
    const ft = m * 3.281;
    return ft < 1000 ? `${Math.round(ft / 10) * 10} ft` : `${(m / 1609).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
