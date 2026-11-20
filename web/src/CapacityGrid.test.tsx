import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { CapacityGrid } from './CapacityGrid'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('marks hours over the limit, including planned hours against zero capacity', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    weeks: ['2025-12-29', '2026-01-05'],
    people: [
      { id: 1, name: 'Ana', weeklyHours: 40, allocatedHours: [40, 45] },
      { id: 2, name: 'Eli', weeklyHours: 0, allocatedHours: [0, 20] },
    ],
  })))

  render(<CapacityGrid from="2025-12-29" to="2026-01-09" />)

  for (const name of ['Ana', 'Eli']) {
    const row = await screen.findByRole('row', { name: new RegExp(`^${name}`) })
    const cells = within(row).getAllByRole('cell').slice(1)
    expect(within(cells[0]).queryByText('Over capacity')).toBeNull()
    expect(within(cells[1]).getByText('Over capacity')).toBeTruthy()
  }
})

it('uses the current date fields when applying and shifts the applied range by a week', async () => {
  const fetchCapacity = vi.fn(async () => Response.json({ weeks: [], people: [] }))
  vi.stubGlobal('fetch', fetchCapacity)
  render(<App />)
  await screen.findByText('No people to show.')

  const from = screen.getByLabelText<HTMLInputElement>('From')
  const to = screen.getByLabelText<HTMLInputElement>('To')
  from.value = '2026-01-14'
  to.value = '2026-01-16'
  fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }))
  await screen.findByText('No people to show.')
  expect(fetchCapacity).toHaveBeenLastCalledWith('/api/capacity?from=2026-01-14&to=2026-01-16', expect.anything())

  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
  await screen.findByText('No people to show.')
  expect(fetchCapacity).toHaveBeenLastCalledWith('/api/capacity?from=2026-01-07&to=2026-01-09', expect.anything())
  expect(from.value).toBe('2026-01-07')
  expect(to.value).toBe('2026-01-09')
})

const dee = { id: 4, name: 'Dee', weeklyHours: 40, allocatedHours: [0, 45, 40] }
const ana = { id: 1, name: 'Ana', weeklyHours: 40, allocatedHours: [40, 0, 30] }
const weeks = ['2025-12-29', '2026-01-05', '2026-01-12']

it('leaves the field on Enter and updates all weeks using the saved capacity', async () => {
  let finishSave!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => { finishSave = resolve })
  const otherPeople = Array.from({ length: 24 }, (_, index) => ({ ...ana, id: index + 10, name: `Person ${index}` }))
  const fetchCapacity = vi.fn()
    .mockResolvedValueOnce(Response.json({ weeks, people: [...otherPeople, ana, dee] }))
    .mockReturnValueOnce(pending)
  vi.stubGlobal('fetch', fetchCapacity)
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
  const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Weekly capacity in hours for Dee' })
  field.focus()
  expect(document.activeElement).toBe(field)
  fireEvent.change(field, { target: { value: '44.5' } })
  fireEvent.keyDown(field, { key: 'Enter' })

  expect(document.activeElement).not.toBe(field)
  expect(screen.getByText('Over capacity')).toBeTruthy()
  expect(screen.getByText('Saving...')).toBeTruthy()
  expect(field.readOnly).toBe(true)
  expect((screen.getByRole('button', { name: 'Next week' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true)
  expect(fetchCapacity).toHaveBeenLastCalledWith('/api/people/4', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"weeklyHours":44.5}',
  })

  finishSave(Response.json({ id: 4, weeklyHours: 45 }))
  await screen.findByDisplayValue('45')
  const row = screen.getByRole('row', { name: /^Dee/ })
  expect(within(row).getAllByRole('cell').slice(1).map((cell) => cell.textContent)).toEqual([
    '0 / 45 h', '45 / 45 h', '40 / 45 h',
  ])
  expect(screen.queryByText('Over capacity')).toBeNull()
  expect(screen.getByText('People 26-26 of 26')).toBeTruthy()
  expect(fetchCapacity).toHaveBeenCalledTimes(2)
})

it('keeps the draft and committed hours when saving fails, then lets the manager retry', async () => {
  const fetchCapacity = vi.fn()
    .mockResolvedValueOnce(Response.json({ weeks, people: [dee, ana] }))
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(Response.json({ id: 4, weeklyHours: 0 }))
  vi.stubGlobal('fetch', fetchCapacity)
  render(<App />)

  const field = await screen.findByRole<HTMLInputElement>('spinbutton', { name: 'Weekly capacity in hours for Dee' })
  fireEvent.change(field, { target: { value: '-1' } })
  fireEvent.blur(field)
  expect(screen.getByRole('alert').textContent).toBe('Enter zero or more hours.')
  expect(fetchCapacity).toHaveBeenCalledTimes(1)

  fireEvent.change(field, { target: { value: '0' } })
  fireEvent.blur(field)

  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Press Enter to retry.')
  expect(field.value).toBe('0')
  const row = screen.getByRole('row', { name: /^Dee/ })
  expect(within(row).getByText('0 / 40 h')).toBeTruthy()
  expect(within(row).getAllByText('Over capacity')).toHaveLength(1)

  field.focus()
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(await within(row).findByText('0 / 0 h')).toBeTruthy()
  expect(within(row).getAllByText('Over capacity')).toHaveLength(2)
  expect(within(screen.getByRole('row', { name: /^Ana/ })).getByText('30 / 40 h')).toBeTruthy()
})
