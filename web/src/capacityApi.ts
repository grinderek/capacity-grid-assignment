export type Person = {
  id: number
  name: string
  weeklyHours: number
  allocatedHours: number[]
}

export type Capacity = {
  weeks: string[]
  people: Person[]
}

export async function fetchCapacity(from: string, to: string, signal: AbortSignal): Promise<Capacity> {
  const query = new URLSearchParams({ from, to })
  const response = await fetch(`/api/capacity?${query}`, { signal })
  if (!response.ok) throw new Error(`Request failed (${response.status}).`)
  return response.json()
}

export async function updateWeeklyHours(id: number, weeklyHours: number): Promise<number> {
  const response = await fetch(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
  if (!response.ok) throw new Error(`Request failed (${response.status}).`)

  const saved: Pick<Person, 'id' | 'weeklyHours'> = await response.json()
  if (saved?.id !== id || !Number.isFinite(saved.weeklyHours) || saved.weeklyHours < 0) {
    throw new Error('Invalid saved capacity.')
  }
  return saved.weeklyHours
}
