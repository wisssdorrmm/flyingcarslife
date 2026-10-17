/**
 * Real-world geography for the mapped area: the local meter frame (shared with the generator in
 * scripts/osm/area.ts), neighborhoods and landmarks.
 * Local meters: +x east, +z south (north is −z).
 */

/** Local origin, near Washington Square. */
export const ORIGIN = { lat: 37.8035, lon: -122.4125 } as const;

const M_PER_DEG_LAT = 110_950;
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function project(lat: number, lon: number): [x: number, z: number] {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}

export function unproject(x: number, z: number): [lat: number, lon: number] {
  return [ORIGIN.lat - z / M_PER_DEG_LAT, ORIGIN.lon + x / M_PER_DEG_LON];
}

export interface District {
  id: string;
  name: string;
  x: number;
  z: number;
}

/** Neighborhood centers; a point belongs to the nearest one. */
export const DISTRICTS: District[] = (
  [
    ['wharf', "Fisherman's Wharf", 37.808, -122.4177],
    ['embarcadero', 'The Embarcadero', 37.8065, -122.4045],
    ['northbeach', 'North Beach', 37.8004, -122.41],
    ['telegraph', 'Telegraph Hill', 37.8022, -122.4045],
    ['russian', 'Russian Hill', 37.8012, -122.4192],
    ['chinatown', 'Chinatown', 37.7962, -122.407],
    ['aquatic', 'Aquatic Park', 37.8068, -122.4232],
  ] as const
).map(([id, name, lat, lon]) => {
  const [x, z] = project(lat, lon);
  return { id, name, x, z };
});

export function districtAt(x: number, z: number): District {
  let best = DISTRICTS[0]!;
  let bestD = Infinity;
  for (const d of DISTRICTS) {
    const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
    if (dd < bestD) {
      best = d;
      bestD = dd;
    }
  }
  return best;
}

export interface Landmark {
  id: string;
  name: string;
  blurb: string;
  x: number;
  z: number;
}

/** Places worth driving to (map search, photo spots later). */
export const LANDMARKS: Landmark[] = (
  [
    ['pier39', 'Pier 39', 'Sea lions and the bay', 37.8087, -122.4098],
    ['coit', 'Coit Tower', 'Top of Telegraph Hill', 37.8024, -122.4058],
    ['washsq', 'Washington Square', 'The heart of North Beach', 37.8008, -122.4102],
    ['lombard', 'Lombard Street', 'The crooked block', 37.8021, -122.4187],
    ['ghirardelli', 'Ghirardelli Square', 'Old chocolate factory', 37.8059, -122.4229],
    ['aquatic', 'Aquatic Park', 'Beach and the pier', 37.8075, -122.4225],
    ['wharfsign', "Fisherman's Wharf", 'Crab stands and boats', 37.808, -122.4177],
    ['church', 'Saints Peter and Paul', 'Twin white spires', 37.8015, -122.4106],
    ['turnaround', 'Cable car turnaround', 'Hyde and Beach', 37.8065, -122.4204],
    ['levis', "Levi's Plaza", 'Fountains below the hill', 37.803, -122.402],
    ['pyramid', 'Transamerica Pyramid', 'The spike on the skyline', 37.7952, -122.4028],
    ['filbert', 'Filbert Street hill', 'One of the steepest drives', 37.8013, -122.4192],
  ] as const
).map(([id, name, blurb, lat, lon]) => {
  const [x, z] = project(lat, lon);
  return { id, name, blurb, x, z };
});
