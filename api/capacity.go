package main

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"
)

//go:embed capacity.sql
var capacityQuery string

type capacityResponse struct {
	Weeks  []string         `json:"weeks"`
	People []personCapacity `json:"people"`
}

type personCapacity struct {
	ID             int       `json:"id"`
	Name           string    `json:"name"`
	WeeklyHours    float64   `json:"weeklyHours"`
	AllocatedHours []float64 `json:"allocatedHours"`
}

// handleCapacity returns weekly allocations for the inclusive date range.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseCapacityRange(r.URL.RawQuery)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Weekday starts at Sunday, so convert it to a Monday-based offset.
	daysSinceMonday := (int(from.Weekday()) + 6) % 7
	firstWeek := from.AddDate(0, 0, -daysSinceMonday)
	var response capacityResponse
	for weekStart := firstWeek; !weekStart.After(to); weekStart = weekStart.AddDate(0, 0, 7) {
		response.Weeks = append(response.Weeks, weekStart.Format(time.DateOnly))
	}

	response.People, err = s.loadCapacityPeople(r.Context(), from, to, firstWeek, len(response.Weeks))
	if err != nil {
		log.Printf("load capacity: %v", err)
		http.Error(w, "could not load capacity", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *server) loadCapacityPeople(ctx context.Context, from, to, firstWeek time.Time, weekCount int) ([]personCapacity, error) {
	rows, err := s.db.Query(ctx, capacityQuery, from, to, firstWeek)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (personCapacity, error) {
		var person personCapacity
		var hoursByWeek map[int]float64
		if err := row.Scan(&person.ID, &person.Name, &person.WeeklyHours, &hoursByWeek); err != nil {
			return personCapacity{}, err
		}

		person.AllocatedHours = make([]float64, weekCount)
		for weekIndex, hours := range hoursByWeek {
			person.AllocatedHours[weekIndex] = hours
		}
		return person, nil
	})
}

func parseCapacityRange(rawQuery string) (time.Time, time.Time, error) {
	query, err := url.ParseQuery(rawQuery)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("invalid query parameters")
	}
	from, err := parseCapacityDate(query, "from")
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	to, err := parseCapacityDate(query, "to")
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if from.After(to) {
		return time.Time{}, time.Time{}, errors.New("from must be on or before to")
	}
	return from, to, nil
}

func parseCapacityDate(query url.Values, name string) (time.Time, error) {
	values := query[name]
	if len(values) != 1 {
		return time.Time{}, fmt.Errorf("%s must be provided once as a date in YYYY-MM-DD format", name)
	}
	date, err := time.Parse(time.DateOnly, values[0])
	if err != nil || date.Year() == 0 {
		return time.Time{}, fmt.Errorf("%s must be a valid date in YYYY-MM-DD format", name)
	}
	return date, nil
}

