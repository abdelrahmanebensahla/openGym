import { describe, expect, test } from 'vitest'
import { dotsCoefficient, dotsScore, dotsOf, bmi, bmiClass, bmrMifflin, ffmi, bodyNumbers, activityOf } from './dots.js'

const SQUAT = '0043', BENCH = '0025', DEADLIFT = '0032'
const wk = (d, id, w, r) => ({ id: d + id, d, start: new Date(d + 'T10:00:00').getTime(), entries: [{ id, target: { mode: 'reps' }, sets: [{ w, r, done: true }] }] })
const base = extra => ({ unit: 'kg', bodyweight: [{ d: '2026-10-01', w: 100 }], workouts: [], ...extra })

describe('DOTS', () => {
  test('matches published examples for men', () => {
    // aifithub.pages.dev/examples/dots-score-examples: 500 kg at 83, 95 and 112 kg, 425 kg at 83 kg
    expect(dotsScore(500, 83, 'male')).toBeCloseTo(337.54, 2)
    expect(dotsScore(500, 95, 'male')).toBeCloseTo(314.94, 2)
    expect(dotsScore(425, 83, 'male')).toBeCloseTo(286.91, 2)
    expect(dotsScore(500, 112, 'male')).toBeCloseTo(294.16, 2)
  })
  test('the women’s curve: 400 kg at 60 kg, worked by hand from the IPF coefficients', () => {
    // -57.96288 + 13.6175032·60 - 0.1126655495·60² + 0.0005158568·60³ - 0.0000010706·60⁴ = 451.0414
    expect(dotsScore(400, 60, 'female')).toBeCloseTo(400 * 500 / 451.0414, 2)
    expect(dotsScore(400, 60, 'female')).toBeGreaterThan(dotsScore(400, 60, 'male'))
  })
  test('body weight is clamped where the formula ends, and no sex uses the men’s curve', () => {
    expect(dotsCoefficient(250, 'male')).toBeCloseTo(dotsCoefficient(210, 'male'), 10)
    expect(dotsCoefficient(30, 'female')).toBeCloseTo(dotsCoefficient(40, 'female'), 10)
    expect(dotsCoefficient(90, null)).toBe(dotsCoefficient(90, 'male'))
  })
  test('nothing to score without a total or a body weight', () => {
    expect(dotsScore(0, 80, 'male')).toBe(null)
    expect(dotsScore(500, 0, 'male')).toBe(null)
  })
  test('the profile total is the best estimated 1RM of squat, bench and deadlift', () => {
    const S = base({ sex: 'male', workouts: [wk('2026-10-02', SQUAT, 250, 1), wk('2026-10-03', BENCH, 170, 1), wk('2026-10-04', DEADLIFT, 280, 1)] })
    const d = dotsOf(S)
    expect(d.totalKg).toBe(700)
    expect(d.score).toBeCloseTo(430.9, 0)
    expect(d.missing).toEqual([])
  })
  test('pounds are converted to kg before scoring', () => {
    const lb = 1 / 0.45359237
    const S = { unit: 'lb', sex: 'male', bodyweight: [{ d: '2026-10-01', w: 100 * lb }],
      workouts: [wk('2026-10-02', SQUAT, 250 * lb, 1), wk('2026-10-03', BENCH, 170 * lb, 1), wk('2026-10-04', DEADLIFT, 280 * lb, 1)] }
    expect(dotsOf(S).score).toBeCloseTo(430.9, 0)
  })
  test('with a lift missing there is no total, but the bench alone still scores', () => {
    const d = dotsOf(base({ workouts: [wk('2026-10-03', BENCH, 170, 1)] }))
    expect(d.score).toBe(null)
    expect(d.missing).toEqual(['squat', 'deadlift'])
    expect(d.benchOnly).toBeCloseTo(170 * dotsCoefficient(100, 'male'), 6)
  })
  test('no weigh-in, no DOTS', () => {
    expect(dotsOf(base({ bodyweight: [], workouts: [wk('2026-10-03', BENCH, 170, 1)] }))).toBe(null)
  })
})

describe('body numbers', () => {
  test('BMI and its class', () => {
    expect(bmi(80, 180)).toBeCloseTo(24.69, 2)
    expect(bmiClass(24.69)).toBe('Healthy range')
    expect(bmiClass(31)).toBe('Obese')
    expect(bmi(80, null)).toBe(null)
  })
  test('Mifflin-St Jeor for men and women, null when something is missing', () => {
    expect(bmrMifflin(80, 180, 30, 'male')).toBe(1780)
    expect(bmrMifflin(60, 165, 30, 'female')).toBeCloseTo(1320.25, 2)
    expect(bmrMifflin(80, 180, null, 'male')).toBe(null)
    expect(bmrMifflin(80, 180, 30, null)).toBe(null)
  })
  test('FFMI and its value normalized to 1.8 m', () => {
    const f = ffmi(100, 178, 20)
    expect(f.leanKg).toBe(80)
    expect(f.value).toBeCloseTo(25.25, 2)
    expect(f.normalized).toBeCloseTo(25.37, 2)
    expect(ffmi(100, 178, null)).toBe(null)
  })
  test('the profile gives maintenance only with an activity level', () => {
    const year = new Date().getFullYear()
    const S = base({ sex: 'male', birthYear: year - 30, heightCm: 180, bodyweight: [{ d: '2026-10-01', w: 80 }] })
    expect(bodyNumbers(S)).toMatchObject({ bmr: 1780, maintenance: null })
    expect(bodyNumbers({ ...S, activity: 1.375 }).maintenance).toBeCloseTo(2447.5, 1)
    expect(activityOf({ activity: 1.4 })).toBe(null)
  })
})
