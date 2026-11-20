import { useRef, useState, type FormEvent } from 'react'
import { CapacityGrid } from './CapacityGrid'

const INITIAL_RANGE = { from: '2025-12-29', to: '2026-01-16' }
type DateRange = typeof INITIAL_RANGE

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}

function rangeError({ from, to }: DateRange) {
  const validDate = /^(?!0000)\d{4}-\d{2}-\d{2}$/
  if (!validDate.test(from) || !validDate.test(to)) return 'Choose two dates between years 0001 and 9999.'
  if (from > to) return 'The start date must be on or before the end date.'

  const limit = new Date(`${from}T00:00:00Z`)
  limit.setUTCFullYear(limit.getUTCFullYear() + 2)
  if (new Date(`${to}T00:00:00Z`) > limit) return 'Choose a range of up to two calendar years.'
  return ''
}

export function App() {
  const [range, setRange] = useState(INITIAL_RANGE)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const fromInput = useRef<HTMLInputElement>(null)
  const toInput = useRef<HTMLInputElement>(null)

  function applyRange(next: DateRange) {
    const message = rangeError(next)
    setError(message)
    if (message) return false

    setRange(next)
    return true
  }

  function shiftWeek(days: number) {
    const next = { from: shiftDate(range.from, days), to: shiftDate(range.to, days) }
    if (!applyRange(next)) return
    if (fromInput.current) fromInput.current.value = next.from
    if (toInput.current) toInput.current.value = next.to
  }

  function submitRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    applyRange({ from: String(fields.get('from')), to: String(fields.get('to')) })
  }

  return (
    <main>
      <h1>Team capacity</h1>
      <div className="toolbar">
        <form className="range-form" aria-label="Date range" onInput={() => setError('')} onSubmit={submitRange}>
          <label>
            From
            <input type="date" name="from" required defaultValue={INITIAL_RANGE.from} ref={fromInput} disabled={isSaving} />
          </label>
          <label>
            To
            <input type="date" name="to" required defaultValue={INITIAL_RANGE.to} ref={toInput} disabled={isSaving} />
          </label>
          <button className="primary-button" type="submit" disabled={isSaving}>Apply dates</button>
        </form>
        <div className="week-navigation" aria-label="Week navigation" role="group">
          <button type="button" disabled={isSaving} onClick={() => shiftWeek(-7)}><span aria-hidden="true">← </span>Previous week</button>
          <button type="button" disabled={isSaving} onClick={() => shiftWeek(7)}>Next week<span aria-hidden="true"> →</span></button>
        </div>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <CapacityGrid
        key={`${range.from}:${range.to}`}
        from={range.from}
        to={range.to}
        onSavePendingChange={setIsSaving}
      />
    </main>
  )
}
