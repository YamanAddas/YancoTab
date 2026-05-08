/**
 * files/engine/storageBreakdown.js — fuel-gauge category aggregation.
 *
 * Walks an array of decorated items (typically the entire fs flatten)
 * and returns:
 *   {
 *     totalBytes: number,
 *     buckets: {
 *       docs: { bytes, percent },
 *       img:  { bytes, percent },
 *       video:{ bytes, percent },
 *       other:{ bytes, percent },   // collapses code/audio/archive
 *     }
 *   }
 *
 * `percent` is 0..1, not 0..100. Folders contribute 0 to byte totals
 * (their meta.size, if present, is the directory entry's size, not
 * the recursive total).
 *
 * Pure module — no DOM, no kernel.
 */

import { fuelBucketOf } from './fileType.js';

export function breakdown(items) {
  const empty = {
    totalBytes: 0,
    buckets: {
      docs:  { bytes: 0, percent: 0 },
      img:   { bytes: 0, percent: 0 },
      video: { bytes: 0, percent: 0 },
      other: { bytes: 0, percent: 0 },
    },
  };
  if (!Array.isArray(items) || items.length === 0) return empty;

  let total = 0;
  const acc = { docs: 0, img: 0, video: 0, other: 0 };
  for (const it of items) {
    if (!it || it.isDir) continue;
    if (!Number.isFinite(it.size) || it.size <= 0) continue;
    const bucket = fuelBucketOf(it.category || 'other');
    acc[bucket] += it.size;
    total += it.size;
  }
  if (total === 0) return empty;
  return {
    totalBytes: total,
    buckets: {
      docs:  { bytes: acc.docs,  percent: acc.docs / total },
      img:   { bytes: acc.img,   percent: acc.img / total },
      video: { bytes: acc.video, percent: acc.video / total },
      other: { bytes: acc.other, percent: acc.other / total },
    },
  };
}
