import type { WorkoutSetRecord } from '../types/domain'

/**
 * Single source of truth for estimated one-rep max.
 *
 * Uses the Brzycki formula -- `weight / (1.0278 - 0.0278 * reps)` -- rather
 * than Epley, because that's what this app's users are already used to
 * seeing (125kg x 6 reads as 145.2kg here; Epley would give ~150kg for the
 * same set). The statistics progression card and the share card both need
 * this number, so it lives here once instead of being re-derived twice --
 * that includes the "which set(s) count" selection rule below, not just the
 * formula: both consumers ask the same question ("what's this session's
 * estimated 1RM for this exercise") and must answer it the same way.
 *
 * Brzycki's denominator (`1.0278 - 0.0278 * reps`) approaches zero around 37
 * reps and goes negative beyond it, which would render as a huge or negative
 * "estimate". The formula is also just not considered reliable much past
 * single-digit-to-low-double-digit rep counts, since fatigue stops behaving
 * linearly. `REP_CEILING` draws that line at 12 reps -- above it,
 * `estimateOneRepMax` returns `null` instead of a number, and callers must
 * render "no estimate" rather than a nonsense figure.
 */
export const REP_CEILING = 12

/**
 * Estimated 1RM in the same unit as `weightKg`, rounded to one decimal place
 * (matching how this app already displays e1RM, e.g. "145.2kg"). Returns
 * `null` when the inputs can't produce a meaningful estimate: a non-positive
 * weight or rep count, or a rep count above `REP_CEILING`.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null
  if (!Number.isFinite(reps) || reps <= 0) return null
  if (reps > REP_CEILING) return null
  if (reps === 1) return roundToOneDecimal(weightKg)

  const denominator = 1.0278 - 0.0278 * reps
  return roundToOneDecimal(weightKg / denominator)
}

/**
 * Highest estimated 1RM across a set of completed sets, not the heaviest
 * set's own estimate -- a lighter set at more reps can estimate higher than
 * a heavier, lower-rep set (e.g. 100kg x 1 estimates 100kg, but 90kg x 5 in
 * the same session estimates 101.3kg). Sets missing a weight (bodyweight
 * exercises) or reps, and sets above `estimateOneRepMax`'s rep ceiling,
 * contribute `null` and are simply skipped rather than treated as zero.
 *
 * Callers must pass already-completed sets -- this doesn't filter on
 * `isCompleted` itself, matching how both current callers (the share card
 * and the exercise-progress chart) already scope their input before calling
 * in.
 */
export function bestEstimatedOneRepMax(completedSets: WorkoutSetRecord[]): number | null {
  let best: number | null = null
  for (const set of completedSets) {
    if (set.weightKg === null || set.reps === null) continue
    const estimate = estimateOneRepMax(set.weightKg, set.reps)
    if (estimate !== null && (best === null || estimate > best)) best = estimate
  }
  return best
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}
