export type Desk = { seat: number; x: number; y: number; rotation: number };
export const DESK_WIDTH = 128;
export const DESK_HEIGHT = 104;
export function deskSize(desk: Desk) {
  return desk.rotation % 180 === 0 ? { width: DESK_WIDTH, height: DESK_HEIGHT } : { width: DESK_WIDTH, height: DESK_WIDTH };
}
export function defaultDesks(highestSeat = 23): Desk[] {
  const count = Math.min(60, Math.max(24, Math.ceil((highestSeat + 1) / 6) * 6));
  return Array.from({ length: count }, (_, seat) => ({ seat, x: (seat % 6) * 144 + (seat % 6 >= 3 ? 24 : 0), y: Math.floor(seat / 6) * 120, rotation: 0 }));
}
export function roomBounds(desks: Desk[]) {
  if (!desks.length) return { x: 0, y: 0, width: 320, height: 200 };
  const x = Math.min(...desks.map(d => d.x)) - 16;
  const y = Math.min(...desks.map(d => d.y)) - 16;
  return { x, y, width: Math.max(...desks.map(d => d.x + deskSize(d).width)) - x + 16, height: Math.max(...desks.map(d => d.y + deskSize(d).height)) - y + 16 };
}

/** Place a new desk in the first free grid cell, filling gaps before adding rows. */
export function nextDeskPosition(desks: Desk[]) {
  const left = desks.length ? Math.min(...desks.map(d => d.x)) : 0;
  const top = desks.length ? Math.min(...desks.map(d => d.y)) : 0;
  for (let row = 0; row <= 60; row++) {
    for (let column = 0; column < 6; column++) {
      const x = left + column * 144;
      const y = top + row * 144;
      if (x > 5000 || y > 5000) continue;
      const overlap = desks.some(d => {
        const size = deskSize(d);
        return x < d.x + size.width + 8 && x + DESK_WIDTH + 8 > d.x && y < d.y + size.height + 8 && y + DESK_HEIGHT + 8 > d.y;
      });
      if (!overlap) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
