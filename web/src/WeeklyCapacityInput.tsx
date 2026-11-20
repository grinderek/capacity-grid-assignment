import { useRef, useState } from 'react'
import type { Person } from './capacityApi'

export function WeeklyCapacityInput({ id, name, weeklyHours, saving, readOnly, onSave }: Pick<Person, 'id' | 'name' | 'weeklyHours'> & {
  saving: boolean
  readOnly: boolean
  onSave: (id: number, weeklyHours: number) => Promise<void>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const messageId = `capacity-message-${id}`

  function reset() {
    setDraft(null)
    setError('')
  }

  async function commit(value: string) {
    if (readOnly || inFlight.current) return

    const hours = Number(value)
    if (!value || !Number.isFinite(hours) || hours < 0) {
      setError('Enter zero or more hours.')
      return
    }
    if (hours === weeklyHours) {
      reset()
      return
    }

    inFlight.current = true
    setDraft(value)
    setError('')
    try {
      await onSave(id, hours)
      reset()
    } catch {
      setError('Could not save. Press Enter to retry.')
    } finally {
      inFlight.current = false
    }
  }

  return (
    <>
      <input
        className="weekly-capacity-input"
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        aria-label={`Weekly capacity in hours for ${name}`}
        aria-describedby={error || saving ? messageId : undefined}
        value={draft ?? weeklyHours}
        readOnly={readOnly}
        onChange={(event) => {
          setDraft(event.target.value)
          setError('')
        }}
        onBlur={(event) => void commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape' && !readOnly) reset()
        }}
      />
      {saving && <span className="capacity-status" id={messageId} role="status">Saving...</span>}
      {error && <span className="capacity-status error-message" id={messageId} role="alert">{error}</span>}
    </>
  )
}
