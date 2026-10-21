// MinHash signatures and LSH banding: fast candidate selection for near-duplicate passages.

function fnv1a(s: string, seed: number) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

const SEEDS = Array.from({ length: 128 }, (_, i) => Math.imul(i + 1, 0x9e3779b1) >>> 0);

/** k-hash MinHash signature of a set of shingles. */
export function signature(shingles: Iterable<string>, k = 64): Uint32Array {
  const sig = new Uint32Array(k).fill(0xffffffff);
  let any = false;
  for (const s of shingles) {
    any = true;
    for (let i = 0; i < k; i++) { const h = fnv1a(s, SEEDS[i]); if (h < sig[i]) sig[i] = h; }
  }
  return any ? sig : sig.fill(0);
}

export function wordShingles(words: string[], n = 3) {
  if (words.length <= n) return new Set([words.join(" ")]);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export const estimateJaccard = (a: Uint32Array, b: Uint32Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) m++;
  return m / a.length;
};

/** Exact Jaccard similarity, used to check candidates. */
export function jaccard<T>(a: Set<T>, b: Set<T>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.max(1, a.size + b.size - inter);
}

/**
 * LSH: split each signature into `bands` bands; items sharing any band become candidate pairs.
 * With b bands of r rows, a pair with Jaccard s is caught with probability 1 − (1 − s^r)^b.
 */
export function lshPairs(left: Uint32Array[], right: Uint32Array[], bands: number) {
  const rows = left[0] ? left[0].length / bands : 0;
  const buckets = new Map<string, number[]>();
  right.forEach((sig, j) => {
    for (let b = 0; b < bands; b++) {
      const key = `${b}|${sig.subarray(b * rows, (b + 1) * rows).join(",")}`;
      const list = buckets.get(key);
      if (list) list.push(j); else buckets.set(key, [j]);
    }
  });
  const pairs = new Set<string>();
  left.forEach((sig, i) => {
    for (let b = 0; b < bands; b++)
      for (const j of buckets.get(`${b}|${sig.subarray(b * rows, (b + 1) * rows).join(",")}`) ?? []) pairs.add(`${i}:${j}`);
  });
  return [...pairs].map((p) => p.split(":").map(Number) as [number, number]);
}
