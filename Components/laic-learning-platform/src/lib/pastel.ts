/** Mix a hex color toward white for solid light-pastel tile backgrounds. */
export function pastelFromHex(hex: string, amount = 0.88): string {
  const raw = String(hex || '').replace('#', '').trim();
  const full = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '#F1F5F9';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const t = Math.min(1, Math.max(0, amount));
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Slightly stronger pastel for icon chips sitting on a pastel tile. */
export function pastelChipFromHex(hex: string): string {
  return pastelFromHex(hex, 0.78);
}
