// DOTS score and body numbers, worked out on this device (personal fork).
//
// DOTS is the IPF's bodyweight-adjusted powerlifting score (2019): total in kg × 500 divided by a
// fourth-degree polynomial of body weight in kg, with one set of coefficients for men and one for
// women. Body weight is clamped to 40-210 kg for men and 40-150 kg for women, as the formula is
// defined. Here the total is the best estimated 1RM of the back squat, the bench press and the
// deadlift (onerm.js best1RM, the profile's formula), so it reads higher or lower than a tested
// meet total, and the screen says so. Without a sex set, the men's coefficients are used, the way
// strength-level.js falls back to the men's table.
//
// The body numbers are the usual ones: BMI (kg / m²), BMR by Mifflin-St Jeor, maintenance as BMR
// times an activity factor, and FFMI (lean kg / m²) with Kouri's normalization to 1.8 m. Each is
// null when what it needs is missing.
import { best1RM, formulaOf } from './onerm.js'
import { lastBW } from './history.js'
import { STANDARDS, sexOf, ageOf } from './strength-level.js'
import { LB_TO_KG } from './recovery.js'

const COEF = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
}
const BW_MAX = { male: 210, female: 150 }

/** The DOTS multiplier for a body weight in kg; 'female' uses the women's curve, anything else the men's. */
export function dotsCoefficient(bwKg, sex) {
  const s = sex === 'female' ? 'female' : 'male'
  const x = Math.min(Math.max(Number(bwKg) || 0, 40), BW_MAX[s])
  const c = COEF[s]
  return 500 / (c[0] + c[1] * x + c[2] * x ** 2 + c[3] * x ** 3 + c[4] * x ** 4)
}
/** The DOTS score for a total and a body weight, both in kg, or null when either is missing. */
export function dotsScore(totalKg, bwKg, sex) {
  if (!(Number(totalKg) > 0) || !(Number(bwKg) > 0)) return null
  return Number(totalKg) * dotsCoefficient(bwKg, sex)
}

const toKg = (S, v) => (S?.unit === 'lb' ? v * LB_TO_KG : v)
export const DOTS_LIFTS = ['squat', 'bench', 'deadlift']

/** The best estimated 1RM of a lift over the catalogue ids it covers, in the profile's unit, or null. */
export function bestOfLift(S, lift, formula = formulaOf(S)) {
  let best = null
  for (const id of STANDARDS[lift]?.ids || []) {
    const b = best1RM(S, id, formula)
    if (b && b.est > 0 && (!best || b.est > best.est)) best = { ...b, id }
  }
  return best
}

/**
 * DOTS from the profile: { score, totalKg, bwKg, sex, lifts: { squat, bench, deadlift }, missing,
 * benchOnly }. `score` needs all three lifts; with the bench alone, `benchOnly` is its DOTS. Null
 * without a weigh-in.
 */
export function dotsOf(S, { formula = formulaOf(S) } = {}) {
  const bw = Number(lastBW(S || { bodyweight: [] })?.w)
  if (!(bw > 0)) return null
  const bwKg = toKg(S, bw)
  const sex = sexOf(S)
  const lifts = {}
  for (const l of DOTS_LIFTS) lifts[l] = bestOfLift(S, l, formula)
  const missing = DOTS_LIFTS.filter(l => !lifts[l])
  const totalKg = missing.length ? null : DOTS_LIFTS.reduce((n, l) => n + toKg(S, lifts[l].est), 0)
  return {
    score: totalKg ? dotsScore(totalKg, bwKg, sex) : null,
    totalKg, bwKg, sex, lifts, missing,
    benchOnly: lifts.bench ? dotsScore(toKg(S, lifts.bench.est), bwKg, sex) : null,
  }
}

// ---- body numbers -------------------------------------------------------------------------

export const ACTIVITY = [
  { value: 1.2, key: 'Desk job, little walking' },
  { value: 1.375, key: 'Lightly active' },
  { value: 1.55, key: 'Moderately active' },
  { value: 1.725, key: 'Very active' },
  { value: 1.9, key: 'Athlete or physical job' },
]
export const activityOf = S => (ACTIVITY.some(a => a.value === Number(S?.activity)) ? Number(S.activity) : null)

export function bmi(kg, cm) {
  const m = Number(cm) / 100
  return kg > 0 && m > 0 ? kg / (m * m) : null
}
export function bmiClass(v) {
  if (!(v > 0)) return null
  return v < 18.5 ? 'Underweight' : v < 25 ? 'Healthy range' : v < 30 ? 'Overweight' : 'Obese'
}
/** Mifflin-St Jeor resting energy in kcal a day; null unless weight, height, age and sex are known. */
export function bmrMifflin(kg, cm, age, sex) {
  if (!(kg > 0) || !(cm > 0) || !(age > 0) || (sex !== 'male' && sex !== 'female')) return null
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
}
/** Fat-free mass index and its value normalized to 1.8 m, or null without a body fat percentage. */
export function ffmi(kg, cm, bodyFatPct) {
  const m = Number(cm) / 100, bf = Number(bodyFatPct)
  if (!(kg > 0) || !(m > 0) || !(bf > 0 && bf < 70)) return null
  const v = kg * (1 - bf / 100) / (m * m)
  return { value: v, normalized: v + 6.1 * (1.8 - m), leanKg: kg * (1 - bf / 100) }
}

/** Every body number the profile can give, with what it is missing for the rest. */
export function bodyNumbers(S) {
  const bw = Number(lastBW(S || { bodyweight: [] })?.w)
  const kg = bw > 0 ? toKg(S, bw) : null
  const cm = Number(S?.heightCm) > 0 ? Number(S.heightCm) : null
  const age = ageOf(S), sex = sexOf(S), act = activityOf(S)
  const b = bmi(kg, cm)
  const r = bmrMifflin(kg, cm, age, sex)
  return {
    kg, cm, age, sex, activity: act,
    bmi: b, bmiClass: bmiClass(b),
    bmr: r, maintenance: r && act ? r * act : null,
    ffmi: ffmi(kg, cm, S?.bodyFat),
  }
}
