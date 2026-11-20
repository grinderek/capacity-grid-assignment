# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

- Treat each assignment row as a separate allocation. The schema allows matching
  rows with distinct IDs, and the seed has 15 rows for every person, project, and
  date range combination. Sum all of their hours

- Count planned hours on Monday through Friday. Include an assignment boundary
  date if it falls on a weekday

- Use the full weekly capacity for a partial week. Count planned hours within
  the selected dates. For someone with a 40-hour weekly capacity and 10 hours
  planned per day from Wednesday through Friday, that selection shows 30 of 40 hours

## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

-

## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

-

## What would you do differently with a week?

- Paginate people in the capacity API with a cursor based on `people.id`.

- Benchmark short and long ranges with `EXPLAIN (ANALYZE, BUFFERS)`. Compare the
  existing `assignments(person_id)` index with a B-tree on `(person_id, start_date, end_date)`. 


