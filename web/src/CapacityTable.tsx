import { useRef, useState } from 'react'
import type { Capacity } from './capacityApi'
import { formatDate } from './capacityDates'
import { WeeklyCapacityInput } from './WeeklyCapacityInput'

const PAGE_SIZE = 25

export function CapacityTable({ weeks, people, savingPersonId, onSave }: Capacity & {
  savingPersonId: number | null
  onSave: (id: number, weeklyHours: number) => Promise<void>
}) {
  const [page, setPage] = useState(0)
  const scrollRegion = useRef<HTMLDivElement>(null)
  if (people.length === 0) return <p className="grid-message">No people to show.</p>

  const start = page * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, people.length)

  function changePage(next: number) {
    setPage(next)
    if (scrollRegion.current) scrollRegion.current.scrollTop = 0
  }

  return (
    <>
      <div className="table-scroll" role="region" aria-label="Weekly capacity grid" tabIndex={0} ref={scrollRegion}>
        <table
          aria-label="Planned hours and weekly capacity"
          style={{ minWidth: `calc(var(--person-width) + var(--capacity-width) + ${weeks.length * 8}rem)` }}
        >
          <colgroup>
            <col className="person-width" />
            <col className="capacity-width" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="person-column">Team member</th>
              <th scope="col" className="capacity-column">Weekly capacity (h)</th>
              {weeks.map((week) => (
                <th scope="col" key={week}>
                  <span className="week-label">Week of</span>
                  <time dateTime={week}>{formatDate(week)}</time>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.slice(start, end).map(({ id, name, weeklyHours, allocatedHours }) => (
              <tr key={id}>
                <th scope="row" className="person-column">{name}</th>
                <td className="capacity-column">
                  <WeeklyCapacityInput
                    id={id}
                    name={name}
                    weeklyHours={weeklyHours}
                    saving={savingPersonId === id}
                    readOnly={savingPersonId !== null}
                    onSave={onSave}
                  />
                </td>
                {weeks.map((week, index) => {
                  const hours = allocatedHours[index]
                  const isOver = hours > weeklyHours
                  return (
                    <td className={isOver ? 'over-capacity' : undefined} key={week}>
                      {hours} / {weeklyHours} h
                      {isOver && <span className="over-label">Over capacity</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid-footer">
        <p role="status">People {start + 1}-{end} of {people.length}</p>
        {people.length > PAGE_SIZE && (
          <div className="pagination" aria-label="People pagination" role="group">
            <button type="button" disabled={page === 0 || savingPersonId !== null} onClick={() => changePage(page - 1)}>Previous page</button>
            <button type="button" disabled={end === people.length || savingPersonId !== null} onClick={() => changePage(page + 1)}>Next page</button>
          </div>
        )}
      </div>
    </>
  )
}
