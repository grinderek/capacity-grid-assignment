const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
})

export function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`))
}
