import { describe, expect, test } from 'vitest'
import { workoutEnergy, treadmillMet, energySummary, weekStartMs, bodyweightKgAt, MET, TEMPO_S } from './workout-energy.js'

const T0 = new Date('2026-10-05T10:00:00').getTime()   // a Monday
const MIN = 60000
const compoundIf = ids => id => ids.includes(id)
const noEx = () => null
const opts = { compound: compoundIf(['SQ']), exercise: noEx }
const session = (entries, mins = 60, start = T0) => ({ id: 'w' + start, d: new Date(start).toISOString().slice(0, 10), start, end: start + mins * MIN, entries })
const reps = (n, r, extra = {}) => Array.from({ length: n }, () => ({ w: 100, r, done: true, ...extra }))

describe('one workout', () => {
  test('work, rest and the net figure add up as the model says', () => {
    const w = session([{ id: 'SQ', sets: reps(2, 5) }, { id: 'CURL', sets: reps(2, 10) }], 30)
    const e = workoutEnergy(w, 100, opts)
    const work = 2 * 5 * TEMPO_S.compound + 2 * 10 * TEMPO_S.isolation   // 40 + 60 s
    expect(e.workSec).toBe(work)
    expect(e.sec).toBe(30 * 60)
    expect(e.betweenSec).toBe(30 * 60 - work)
    const net = (MET.compound - 1) * 100 * 40 / 3600 + (MET.isolation - 1) * 100 * 60 / 3600 + (MET.between - 1) * 100 * (1800 - work) / 3600
    expect(e.net).toBeCloseTo(net, 6)
    expect(e.gross).toBeGreaterThan(e.net)
    expect(e.timed).toBe(true)
  })
  test('sets not done count for nothing', () => {
    const w = session([{ id: 'SQ', sets: [...reps(1, 5), { w: 100, r: 5, done: false }] }], 10)
    expect(workoutEnergy(w, 80, opts).sets).toBe(1)
  })
  test('a forgotten finish is capped, an untimed workout is given two minutes a set', () => {
    const forgot = workoutEnergy(session([{ id: 'SQ', sets: reps(2, 5) }], 600), 80, opts)
    expect(forgot.sec).toBe(40 + 2 * 600 + 900)
    const untimed = workoutEnergy({ d: '2026-10-05', entries: [{ id: 'SQ', sets: reps(2, 5) }] }, 80, opts)
    expect(untimed.sec).toBe(40 + 2 * 120)
    expect(untimed.timed).toBe(false)
  })
  test('a per-side set counts both sides', () => {
    const side = { done: true, sides: { L: { r: 8, done: true }, R: { r: 8, done: true } } }
    expect(workoutEnergy(session([{ id: 'X', sets: [side] }], 5), 80, opts).workSec).toBe(16 * TEMPO_S.isolation)
  })
  test('cardio with a speed uses ACSM, without one 6 MET, a hold 3.8 MET', () => {
    const walk = session([{ id: 'TM', sets: [{ speed: 5, incline: 10, min: 20, done: true }] }], 20)
    const e = workoutEnergy(walk, 100, opts)
    expect(e.cardioSec).toBe(1200)
    expect(e.net).toBeCloseTo((treadmillMet(5, 10) - 1) * 100 * 1200 / 3600, 6)
    const bike = workoutEnergy(session([{ id: 'BK', sets: [{ min: 10, done: true }] }], 10), 100, { ...opts, exercise: () => ({ bp: 'cardio' }) })
    expect(bike.cardioSec).toBe(600)
    expect(bike.net).toBeCloseTo((MET.cardioUnknown - 1) * 100 * 600 / 3600, 6)
    const plank = workoutEnergy(session([{ id: 'PL', sets: [{ sec: 60, done: true }] }], 1), 100, opts)
    expect(plank.holdSec).toBe(60)
  })
  test('no body weight, no estimate', () => {
    expect(workoutEnergy(session([{ id: 'SQ', sets: reps(1, 5) }]), null, opts)).toBe(null)
  })
})

describe('treadmill equations', () => {
  test('walking at 5 km/h and 10 % is about 7.7 MET, running switches equation at 8 km/h', () => {
    // v = 83.33 m/min: 3.5 + 0.1·83.33 + 1.8·83.33·0.10 = 26.83 ml/kg/min = 7.67 MET
    expect(treadmillMet(5, 10)).toBeCloseTo(7.67, 2)
    expect(treadmillMet(10, 0)).toBeCloseTo((3.5 + 0.2 * 10000 / 60) / 3.5, 6)
    expect(treadmillMet(0)).toBe(0)
  })
})

describe('the summary', () => {
  test('weeks run oldest to newest with this week last, and workouts land in theirs', () => {
    const S = { unit: 'kg', bodyweight: [{ d: '2026-09-01', w: 90 }], workouts: [
      session([{ id: 'SQ', sets: reps(2, 5) }], 45, T0 - 7 * 86400000),
      session([{ id: 'SQ', sets: reps(2, 5) }], 45, T0),
      session([{ id: 'SQ', sets: reps(2, 5) }], 45, T0 + 86400000),
    ] }
    const sum = energySummary(S, { now: T0 + 2 * 86400000, weeks: 3, ...opts })
    // three weeks asked, but the first workout was last week: the week before it is left out
    expect(sum.series.map(p => p.t)).toEqual([weekStartMs(T0 - 7 * 86400000), weekStartMs(T0)])
    expect(sum.series[0].y).toBe(Math.round(sum.rows[0].net))
    expect(sum.thisWeek).toBe(Math.round(sum.rows[1].net + sum.rows[2].net))
    expect(sum.workouts30).toBe(3)
    expect(sum.latest.t).toBe(T0 + 86400000)
  })
  test('a gap week inside your history stays as a zero', () => {
    const S = { unit: 'kg', bodyweight: [{ d: '2026-09-01', w: 90 }], workouts: [
      session([{ id: 'SQ', sets: reps(2, 5) }], 45, T0 - 14 * 86400000),
      session([{ id: 'SQ', sets: reps(2, 5) }], 45, T0),
    ] }
    expect(energySummary(S, { now: T0, weeks: 12, ...opts }).series.map(p => p.y > 0)).toEqual([true, false, true])
  })
  test('a Sunday start moves the week boundary', () => {
    const sun = new Date('2026-10-04T15:00:00').getTime()
    expect(weekStartMs(sun, 0)).toBe(new Date('2026-10-04T00:00:00').getTime())
    expect(weekStartMs(sun, 1)).toBe(new Date('2026-09-28T00:00:00').getTime())
  })
  test('pounds become kg, and the nearest weigh-in is used however far', () => {
    const S = { unit: 'lb', bodyweight: [{ d: '2025-01-01', w: 220 }] }
    expect(bodyweightKgAt(S, T0)).toBeCloseTo(99.79, 2)
  })
})
