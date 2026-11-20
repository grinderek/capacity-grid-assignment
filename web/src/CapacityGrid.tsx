import { useEffect, useState } from 'react'
import { fetchCapacity, updateWeeklyHours, type Capacity } from './capacityApi'
import { formatDate } from './capacityDates'
import { CapacityTable } from './CapacityTable'

type Props = {
  from: string
  to: string
  onSavePendingChange?: (pending: boolean) => void
}

type RequestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; capacity: Capacity }

export function CapacityGrid({ from, to, onSavePendingChange }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [request, setRequest] = useState<RequestState>({ status: 'loading' })
  const [savingPersonId, setSavingPersonId] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    async function loadCapacity() {
      try {
        const capacity = await fetchCapacity(from, to, signal)
        if (!signal.aborted) setRequest({ status: 'success', capacity })
      } catch (error) {
        if (signal.aborted) return
        const message = error instanceof Error ? error.message : 'Request failed.'
        setRequest({ status: 'error', message })
      }
    }

    void loadCapacity()
    return () => controller.abort()
  }, [from, to, attempt])

  async function saveWeeklyHours(id: number, weeklyHours: number) {
    setSavingPersonId(id)
    onSavePendingChange?.(true)
    try {
      const savedHours = await updateWeeklyHours(id, weeklyHours)

      setRequest((current) => {
        if (current.status !== 'success') return current
        const people = current.capacity.people.map((person) =>
          person.id === id ? { ...person, weeklyHours: savedHours } : person,
        )
        return { ...current, capacity: { ...current.capacity, people } }
      })
    } finally {
      setSavingPersonId(null)
      onSavePendingChange?.(false)
    }
  }

  const rangeLabel = from === to ? formatDate(from) : `${formatDate(from)} - ${formatDate(to)}`

  return (
    <section className="capacity" aria-labelledby="selected-range">
      <div className="capacity-heading">
        <h2 id="selected-range">{rangeLabel}</h2>
        {request.status === 'success' && request.capacity.people.length > 0 && (
          <p>Planned / weekly capacity (hours)</p>
        )}
      </div>

      {request.status === 'loading' && <p className="grid-message" role="status">Loading capacity...</p>}
      {request.status === 'error' && (
        <div className="grid-message">
          <p className="error-message" role="alert">Could not load capacity. {request.message}</p>
          <button type="button" onClick={() => {
            setRequest({ status: 'loading' })
            setAttempt(attempt + 1)
          }}>Retry</button>
        </div>
      )}
      {request.status === 'success' && (
        <CapacityTable {...request.capacity} savingPersonId={savingPersonId} onSave={saveWeeklyHours} />
      )}
    </section>
  )
}
