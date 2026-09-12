export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function mag(a) {
  return Math.hypot(a.x, a.y, a.z);
}

export function dist(a, b) {
  return mag(sub(a, b));
}

export function angleBetween(v1, v2) {
  const m1 = mag(v1);
  const m2 = mag(v2);
  if (m1 < 1e-6 || m2 < 1e-6) return 0;
  const cos = Math.min(1, Math.max(-1, dot(v1, v2) / (m1 * m2)));
  return Math.acos(cos);
}

export function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}
