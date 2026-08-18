/**
 * Single source of truth for estimated one-rep max.
 *
 * Uses the Brzycki formula -- `weight / (1.0278 - 0.0278 * reps)` -- rather
 * than Epley, because that's what this app's users are already used to
 * seeing (125kg x 6 reads as 145.2kg here; Epley would give ~150kg for the
 * same set). The statistics progression card and the share card both need
 * this number, so it lives here once instead of being re-derived twice.
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

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}
