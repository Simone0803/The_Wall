export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRandom {
  constructor(seed = 1) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, maxInclusive) {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick(items) {
    return items[this.int(0, items.length - 1)];
  }
}

export function makeSeed(...parts) {
  return hashString(parts.map(String).join("|"));
}

export function weightedPick(items, weights, rng) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return items[0];

  let roll = rng.range(0, total);
  for (let i = 0; i < items.length; i += 1) {
    roll -= Math.max(0, weights[i]);
    if (roll <= 0) return items[i];
  }

  return items[items.length - 1];
}
