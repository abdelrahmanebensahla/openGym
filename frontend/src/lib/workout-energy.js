// Calories a workout burned, estimated on this device from what was logged (personal fork).
//
// THE MODEL. A session is split into the time spent working and everything in between:
//   - a reps set works for its reps at about 4 s each on a compound lift and 3 s on an isolation
//     one, at 8 MET (compound) or 5 MET (isolation). Squats and deadlifts and their kin are
//     compound; warmup-ramp.js isCompoundEx decides which is which.
//   - a cardio row with a speed (km/h) and an optional incline uses the ACSM metabolic equations:
//     walking below 8 km/h (5 mph), running at or above it. A cardio row with a length and no
//     speed (bike, rower, stairs) is counted at 6 MET.
//   - a timed hold (a plank, a dead hang) is counted at 3.8 MET for its length.
//   - everything else in the session (rest, setup, walking between stations) is counted at
//     1.8 MET, standing and moving around lightly.
// Net calories subtract what the body burns anyway at rest (1 MET), which is the number to set
// against a maintenance estimate. Gross includes it.
//
// THE SESSION'S LENGTH comes from its start and end. A session left running long after its last
// set (the finish forgotten) is capped at its work plus ten minutes a set plus a quarter hour.
// A session with no times (imported) is given its work plus two minutes a set.
//
// The weight is the body weight closest to the workout's date. No weigh-in, no estimate: the
// screen asks for one instead of guessing. These are estimates; resistance training's real
// cost varies a lot with effort and rest, and the result is usually 5 to 10 kcal per hard set.
import { workoutDuration } from './history.js'
import { hasCompletedWork, isSideSet } from './workout-model.js'
import { isCompoundEx } from './warmup-ramp.js'
import { exerciseOf } from './exercises.js'
import { bodyweightAt } from './relative-strength.js'
import { LB_TO_KG } from './recovery.js'

export const MET = { compound: 8, isolation: 5, cardioUnknown: 6, hold: 3.8, between: 1.8, rest: 1 }
export const TEMPO_S = { compound: 4, isolation: 3 }
const DAY = 86400000

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)
const kcal = (met, kg, sec) => met * kg * sec / 3600

/** MET of walking or running at a speed (km/h) and incline (percent), from the ACSM equations. */
export function treadmillMet(kmh, inclinePct = 0) {
  const v = num(kmh) * 1000 / 60            // m/min
  if (!(v > 0)) return 0
  const grade = Math.max(0, Number(inclinePct) || 0) / 100
  const vo2 = kmh < 8 ? 3.5 + 0.1 * v + 1.8 * v * grade : 3.5 + 0.2 * v + 0.9 * v * grade
  return vo2 / 3.5
}

// A row's own length in seconds: min and sec, both sides of a per-side row.
function rowSeconds(s) {
  if (isSideSet(s)) return num(s.sides.L?.min) * 60 + num(s.sides.L?.sec) + num(s.sides.R?.min) * 60 + num(s.sides.R?.sec)
  return num(s.min) * 60 + num(s.sec)
}
// A row's reps, both sides counted for a per-side row (each side is its own work).
function rowReps(s) {
  if (isSideSet(s)) return num(s.sides.L?.r) + num(s.sides.R?.r)
  return num(s.r)
}
const isCardioEx = ex => !!ex && (ex.bp === 'cardio' || ex.cat === 'cardio' || ex.tg === 'cardiovascular system')

/**
 * The energy of one workout for a body weight in kg.
 * Returns { net, gross, sec, workSec, cardioSec, holdSec, betweenSec, sets, timed } (kcal and
 * seconds), or null without a body weight. `timed` says the length came from the session's own
 * start and end rather than the fallback.
 */
export function workoutEnergy(w, bwKg, { compound = isCompoundEx, exercise = exerciseOf } = {}) {
  const kg = num(bwKg)
  if (!kg || !w) return null
  let workSec = 0, cardioSec = 0, holdSec = 0, sets = 0, netWork = 0, grossWork = 0
  for (const e of w.entries || []) {
    const ex = exercise(e?.id) || null
    const isComp = !!compound(e?.id)
    for (const s of e?.sets || []) {
      if (!hasCompletedWork(s)) continue
      const reps = rowReps(s), len = rowSeconds(s), speed = num(s.speed)
      let met = 0, sec = 0
      if (speed > 0 || (len > 0 && !reps && isCardioEx(ex))) {
        sec = len
        met = speed > 0 ? treadmillMet(speed, s.incline) : MET.cardioUnknown
        cardioSec += sec
      } else if (reps > 0) {
        sec = reps * (isComp ? TEMPO_S.compound : TEMPO_S.isolation)
        met = isComp ? MET.compound : MET.isolation
        workSec += sec
      } else if (len > 0) {
        sec = len
        met = MET.hold
        holdSec += sec
      } else continue
      sets++
      netWork += kcal(met - MET.rest, kg, sec)
      grossWork += kcal(met, kg, sec)
    }
  }
  const active = workSec + cardioSec + holdSec
  const logged = workoutDuration(w) / 1000
  const timed = logged > 0
  const cap = active + sets * 600 + 900
  const total = timed ? Math.min(Math.max(logged, active), cap) : active + sets * 120
  const betweenSec = Math.max(0, total - active)
  return {
    net: netWork + kcal(MET.between - MET.rest, kg, betweenSec),
    gross: grossWork + kcal(MET.between, kg, betweenSec),
    sec: total, workSec, cardioSec, holdSec, betweenSec, sets, timed,
  }
}

const workoutTime = w => {
  const start = Number(w?.start)
  if (Number.isFinite(start) && start > 0) return start
  const d = String(w?.d || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00').getTime() : NaN
}

/** Body weight in kg at a time: the nearest weigh-in, however far, in the profile's unit. */
export function bodyweightKgAt(S, t) {
  const w = bodyweightAt(S?.bodyweight || [], t, Infinity)
  if (!(w > 0)) return null
  return S?.unit === 'lb' ? w * LB_TO_KG : w
}

/** Every workout with its energy and time, oldest first; workouts that can't be read are left out. */
export function energyRows(S, opts) {
  const out = []
  for (const w of S?.workouts || []) {
    const t = workoutTime(w)
    if (!Number.isFinite(t)) continue
    const en = workoutEnergy(w, bodyweightKgAt(S, t), opts)
    if (en) out.push({ w, t, ...en })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** The start (local midnight, ms) of the week a time falls in, for a first weekday (0 Sunday, 1 Monday). */
export function weekStartMs(t, weekStart = 1) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() - weekStart + 7) % 7))
  return d.getTime()
}

/**
 * The energy summary Stats shows: the last `weeks` weeks as { t, y } (net kcal a week, the
 * current week last, empty weeks as 0), this week's total, the average per workout over the last
 * 30 days, and the latest workout.
 */
export function energySummary(S, { now = Date.now(), weeks = 12, weekStart = 1, ...opts } = {}) {
  const rows = energyRows(S, opts)
  const cur = weekStartMs(now, weekStart)
  const series = []
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cur)
    d.setDate(d.getDate() - i * 7)
    series.push({ t: d.getTime(), y: 0 })
  }
  for (const r of rows) {
    const ws = weekStartMs(r.t, weekStart)
    const slot = series.find(p => p.t === ws)
    if (slot) slot.y += r.net
  }
  series.forEach(p => { p.y = Math.round(p.y) })
  // Weeks before the first workout are not zero weeks, just weeks before you started: leave them out.
  const first = rows.length ? weekStartMs(rows[0].t, weekStart) : cur
  while (series.length > 1 && series[0].t < first) series.shift()
  const last30 = rows.filter(r => r.t > now - 30 * DAY && r.t <= now)
  const avg = last30.length ? last30.reduce((n, r) => n + r.net, 0) / last30.length : null
  const avgMin = last30.length ? last30.reduce((n, r) => n + r.sec, 0) / last30.length / 60 : null
  return {
    rows, series,
    thisWeek: series.length ? series[series.length - 1].y : 0,
    avgPerWorkout: avg == null ? null : Math.round(avg),
    avgMinutes: avgMin == null ? null : Math.round(avgMin),
    workouts30: last30.length,
    latest: rows.length ? rows[rows.length - 1] : null,
  }
}
