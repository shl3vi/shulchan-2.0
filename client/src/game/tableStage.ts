/** Design resolution. The table is drawn in these pixels, then scaled uniformly onto the screen. */
export const STAGE_W = 390;
export const STAGE_H = 610;

export const SEAT_W = 76;
export const SEAT_H = 124;
/** Distance from the top of a seat widget to the center of the video frame. */
export const SEAT_TOP = 47;

/** Avatar centers. Index 0 is the hero at the bottom. The rest go clockwise, mirrored left and right. */
export const SEAT_CENTERS = [
  { x: 195, y: 528 },
  { x: 336, y: 430 },
  { x: 350, y: 300 },
  { x: 348, y: 175 },
  { x: 248, y: 78 },
  { x: 142, y: 78 },
  { x: 42, y: 175 },
  { x: 40, y: 300 },
  { x: 54, y: 430 },
] as const;

export const FELT = { x: 46, y: 86, w: 298, h: 428 };
export const RAIL = 12;

const FELT_CENTER = { x: FELT.x + FELT.w / 2, y: FELT.y + FELT.h / 2 };

export function betAnchor(visualIndex: number) {
  const seat = SEAT_CENTERS[visualIndex] ?? SEAT_CENTERS[0];
  const dx = FELT_CENTER.x - seat.x;
  const dy = FELT_CENTER.y - seat.y;
  const length = Math.hypot(dx, dy) || 1;
  const inset = visualIndex === 0 ? 62 : 58;
  return {
    x: seat.x + (dx / length) * inset,
    y: seat.y + (dy / length) * inset,
  };
}
