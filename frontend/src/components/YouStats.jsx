// Personal fork: the Stats cards that read your own numbers. Calories burned (lib/workout-energy.js),
// DOTS (lib/dots.js) and the body numbers (BMI, BMR, maintenance, FFMI). Worked out on this device.
import { useMemo } from 'react'
import { t } from '../lib/i18n.js'
import { fmtNum, fmtDate, exerciseNameText } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { energySummary } from '../lib/workout-energy.js'
import { dotsOf, bodyNumbers, DOTS_LIFTS } from '../lib/dots.js'
import { weekStartOf } from '../lib/format.js'
import { bwSheet } from '../sheets.jsx'
import LineChart from './LineChart.jsx'
import { Button } from './ui.jsx'
import { aboutYouSheet } from './StrengthLevel.jsx'

const kc = n => (n == null ? '–' : fmtNum(Math.round(n)))
const LIFT_NAME = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift' }

function NeedsWeight() {
  return <div className="row between" style={{ gap: 10 }}>
    <div className="muted small">{t('Log your body weight and the estimate appears here.')}</div>
    <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
  </div>
}

/** Calories burned in training: this week, a typical workout, and the last 12 weeks. */
export function EnergyCard({ S }) {
  const sum = useMemo(() => energySummary(S, { weekStart: weekStartOf(S) }), [S.workouts, S.bodyweight, S.unit, S.weekStart])
  const body = useMemo(() => bodyNumbers(S), [S])
  if (!(S.workouts || []).length) return null
  const any = sum.rows.length > 0
  return <div className="card" data-energy>
    <h2>{t('Calories burned')} <span className="dim">· {t('Training only, net of what you burn at rest.')}</span></h2>
    {!any ? <NeedsWeight /> : <>
      <div className="kpis" style={{ marginBottom: 10 }}>
        <div className="tile"><div className="l">{t('This week')}</div><div className="v">{kc(sum.thisWeek)}</div></div>
        <div className="tile"><div className="l">{t('Per workout')}</div><div className="v">{kc(sum.avgPerWorkout)}</div></div>
        <div className="tile"><div className="l">{t('Avg length')}</div><div className="v">{sum.avgMinutes == null ? '–' : sum.avgMinutes + ' ' + t('min')}</div></div>
      </div>
      <div className="chart"><LineChart points={sum.series} h={130} unit="kcal" /></div>
      {sum.latest && <div className="small" style={{ marginTop: 6 }}>
        <span className="dim">{t('Last workout')} {fmtDate(new Date(sum.latest.t).toISOString().slice(0, 10), true)}:</span>{' '}
        <b>{kc(sum.latest.net)} kcal</b> <span className="dim">· {Math.round(sum.latest.sec / 60)} {t('min')} · {sum.latest.sets} {t('sets')}</span>
      </div>}
      <div className="small dim" style={{ marginTop: 8 }}>
        {body.maintenance
          ? t('Your maintenance is about {0} kcal a day, and that already includes training. This card shows how much of it the gym is.', fmtNum(Math.round(body.maintenance / 10) * 10))
          : <>{t('Add your height, age and activity to see your maintenance next to this.')}{' '}
            <button type="button" className="slevel-about" onClick={aboutYouSheet}>{t('About you')}</button></>}
      </div>
      <div className="small dim" style={{ marginTop: 6 }}>{t('Estimated from your sets, the length of each session and your body weight that day. Lifting burns less than it feels like: about 5 to 10 kcal a hard set.')}</div>
    </>}
  </div>
}

/** DOTS: the bodyweight-adjusted powerlifting score from your best squat, bench and deadlift. */
export function DotsCard({ S }) {
  const d = useMemo(() => dotsOf(S), [S])
  if (!(S.workouts || []).length) return null
  const unit = S.unit
  return <div className="card" data-dots>
    <div className="row between" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>DOTS</h2>
      <Button size="sm" icon="person" onClick={aboutYouSheet}>{t('About you')}</Button>
    </div>
    {!d ? <NeedsWeight /> : <>
      <div className="row" style={{ alignItems: 'baseline', gap: 10, margin: '4px 0 8px' }}>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 }}>{d.score ? fmtNum(Math.round(d.score * 10) / 10) : '–'}</div>
        <div className="small dim">{d.score
          ? t('from a {0} kg total at {1} kg', fmtNum(Math.round(d.totalKg)), fmtNum(Math.round(d.bwKg * 10) / 10))
            + (unit === 'lb' ? ' (' + fmtNum(Math.round(d.totalKg / 0.45359237)) + ' lb, ' + fmtNum(Math.round(d.bwKg / 0.45359237 * 10) / 10) + ' lb)' : '')
          : t('Needs a squat, a bench press and a deadlift.')}</div>
      </div>
      {DOTS_LIFTS.map(l => {
        const b = d.lifts[l]
        return <div key={l} className="slevel-row">
          <span className="slevel-ex">{b && EXIDX[b.id] ? exerciseNameText(EXIDX[b.id]) : t(LIFT_NAME[l])}</span>
          <span className="slevel-meta">{b ? <><b>{fmtNum(Math.round(b.est))} {unit}</b> · {t('est. 1RM')}</> : t('Not logged yet')}</span>
        </div>
      })}
      {!d.score && d.benchOnly && <div className="small" style={{ marginTop: 8 }}>
        {t('Bench press alone:')} <b>{fmtNum(Math.round(d.benchOnly * 10) / 10)}</b> <span className="dim">{t('DOTS points, to compare your bench across body weights.')}</span>
      </div>}
      <div className="small dim" style={{ marginTop: 8 }}>
        {t('DOTS scores a powerlifting total against body weight, so lifters of any size compare on one scale. This uses estimated 1RMs from training, not a tested total.')}
        {!d.sex && <> {t('Using the men’s formula until you set your sex.')}</>}
      </div>
    </>}
  </div>
}

/** BMI, resting and maintenance calories, and FFMI when body fat is known. */
export function BodyNumbersCard({ S }) {
  const b = useMemo(() => bodyNumbers(S), [S])
  const missing = [!b.kg && t('a weigh-in'), !b.cm && t('height'), !b.age && t('year of birth'), !b.sex && t('sex'), !b.activity && t('activity')].filter(Boolean)
  return <div className="card" data-body-numbers>
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Your numbers')}</h2>
      <Button size="sm" icon="person" onClick={aboutYouSheet}>{t('About you')}</Button>
    </div>
    <div className="kpis you-two" style={{ marginBottom: 8 }}>
      <div className="tile"><div className="l">{t('Maintenance')}</div><div className="v">{b.maintenance ? fmtNum(Math.round(b.maintenance / 10) * 10) : '–'}</div><div className="small dim">{t('kcal a day')}</div></div>
      <div className="tile"><div className="l">{t('At rest (BMR)')}</div><div className="v">{b.bmr ? fmtNum(Math.round(b.bmr)) : '–'}</div><div className="small dim">{t('kcal a day')}</div></div>
      <div className="tile"><div className="l">BMI</div><div className="v">{b.bmi ? fmtNum(Math.round(b.bmi * 10) / 10) : '–'}</div><div className="small dim">{b.bmiClass ? t(b.bmiClass) : t('needs height')}</div></div>
      <div className="tile"><div className="l">FFMI</div><div className="v">{b.ffmi ? fmtNum(Math.round(b.ffmi.normalized * 10) / 10) : '–'}</div><div className="small dim">{b.ffmi ? t('normalized, {0} lean', fmtNum(Math.round((S.unit === 'lb' ? b.ffmi.leanKg / 0.45359237 : b.ffmi.leanKg))) + ' ' + S.unit) : t('needs body fat %')}</div></div>
    </div>
    {missing.length > 0 && <div className="small dim">{t('Missing: {0}.', missing.join(', '))}</div>}
    {b.bmi && b.ffmi && b.bmi >= 25 && b.ffmi.normalized >= 21 && <div className="small dim" style={{ marginTop: 4 }}>
      {t('Your FFMI is above average, so BMI overstates your body fat: muscle counts as weight too.')}
    </div>}
    <div className="small dim" style={{ marginTop: 6 }}>{t('Maintenance is an estimate (Mifflin-St Jeor times your activity). Two or three weeks of real weigh-ins against what you eat beat any formula.')}</div>
  </div>
}
