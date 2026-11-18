import { playSfx } from "@/game/sfx";

type DieState = { x: number; y: number; vx: number; vy: number; rot: number; vrot: number };

let lastClack = 0;

/** One knock of the dice in the cup; a harder knock is louder. Knocks closer than 45 ms are merged. */
export function diceClack(strength = 1) {
  const now = Date.now();
  if (now - lastClack < 45) return;
  lastClack = now;
  playSfx("diceClack", 0.35 + 0.65 * Math.max(0, Math.min(1, strength)));
}

/** A backgammon checker landing on its point. */
export function checkerPlace() {
  playSfx("checkerPlace");
}

export function stepDice(dice: DieState[], radius: number, dt: number) {
  const drag = Math.pow(0.14, dt);
  for (const die of dice) {
    die.vx *= drag;
    die.vy *= drag;
    die.vrot *= drag;
    die.x += die.vx * dt;
    die.y += die.vy * dt;
    die.rot += die.vrot * dt;
    const dist = Math.hypot(die.x, die.y) || 0.001;
    if (dist > radius) {
      const nx = die.x / dist;
      const ny = die.y / dist;
      die.x = nx * radius;
      die.y = ny * radius;
      const impact = die.vx * nx + die.vy * ny;
      if (impact > 0) {
        die.vx -= 2 * impact * nx;
        die.vy -= 2 * impact * ny;
        die.vx *= 0.62;
        die.vy *= 0.62;
        die.vrot += (Math.random() - 0.5) * 900;
        diceClack(Math.min(1, impact / 80));
      }
    }
  }
  const a = dice[0];
  const b = dice[1];
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const min = 16;
  if (dist < min) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = (min - dist) / 2;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel > 0) {
      a.vx -= rel * nx;
      a.vy -= rel * ny;
      b.vx += rel * nx;
      b.vy += rel * ny;
      a.vrot += (Math.random() - 0.5) * 700;
      b.vrot += (Math.random() - 0.5) * 700;
      diceClack(Math.min(1, rel / 90));
    }
  }
}
