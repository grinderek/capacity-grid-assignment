-- $1 and $2 are the inclusive dates. $3 is the Monday of week index zero.
-- Each assignment contributes only to intersecting weekdays.
-- Sum every assignment row before calculating hours for matching intervals.
WITH assignment_rates AS (
    SELECT person_id,
           GREATEST(start_date, $1::date) AS first_day,
           LEAST(end_date, $2::date) AS last_day,
           SUM(hours_per_day) AS hours_per_day
    FROM assignments
    WHERE start_date <= $2::date AND end_date >= $1::date
      AND start_date <= end_date
    GROUP BY person_id, start_date, end_date
),
assignment_weeks AS (
    SELECT a.person_id, w.week_index, a.hours_per_day,
           GREATEST(a.first_day, $3::date + 7 * w.week_index) AS first_day,
           LEAST(a.last_day, $3::date + 7 * w.week_index + 4) AS last_day
    FROM assignment_rates AS a
    -- Unnest the intersection's week indexes to avoid the planner's large
    -- default row estimate for a generate_series with variable bounds.
    CROSS JOIN LATERAL unnest(ARRAY(
        SELECT generate_series(
            (a.first_day - $3::date) / 7,
            (a.last_day - $3::date) / 7
        )
    )) AS w(week_index)
),
weekly_allocations AS (
    SELECT person_id, week_index,
           SUM(hours_per_day * (last_day - first_day + 1)) AS hours
    FROM assignment_weeks
    WHERE first_day <= last_day
    GROUP BY person_id, week_index
)
SELECT p.id, p.name, p.weekly_hours,
       json_object_agg(w.week_index, w.hours)
           FILTER (WHERE w.week_index IS NOT NULL) AS hours_by_week
FROM people AS p
LEFT JOIN weekly_allocations AS w ON w.person_id = p.id
GROUP BY p.id
ORDER BY p.id

