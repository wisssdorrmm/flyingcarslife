/**
 * Phase 1 block layout, in meters. +X east, +Z south, +Y up.
 * Main Street runs east–west along z = 0; 1st Avenue runs north–south along x = 0.
 */
export const LAYOUT = {
  /** Half of curb-to-curb width. */
  mainHalfWidth: 8.5,
  crossHalfWidth: 6,
  /** Main Street lanes per side, from the curb inward. */
  mainLanes: { parking: 2.5, travel: 3 },
  crossLanes: { parking: 2.5, travel: 3.5 },
  sidewalkWidth: 4.5,
  curbHeight: 0.15,
  cornerRadius: 4,
  /** How far streets extend from the intersection. */
  streetLength: 215,
  /** How far buildings line the streets from the intersection. */
  buildingExtent: 205,
  /** Buildings farther than this from the intersection use the low-detail facade (no window frames). */
  detailRadius: 80,
  crosswalkWidth: 3.2,
  stopLineGap: 1.2,
} as const;

/** Distance from street centerline to building line. */
export const mainBuildingLine = LAYOUT.mainHalfWidth + LAYOUT.sidewalkWidth;
export const crossBuildingLine = LAYOUT.crossHalfWidth + LAYOUT.sidewalkWidth;
