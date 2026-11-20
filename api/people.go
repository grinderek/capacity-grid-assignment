package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// handleUpdatePerson updates the weekly capacity shared by all date ranges.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 32)
	if err != nil || id <= 0 {
		http.Error(w, "id must be a positive integer", http.StatusBadRequest)
		return
	}

	var input struct {
		WeeklyHours *float64 `json:"weeklyHours"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	if err := decoder.Decode(&input); err != nil || decoder.Decode(new(json.RawMessage)) != io.EOF {
		http.Error(w, "body must be a JSON object with numeric weeklyHours", http.StatusBadRequest)
		return
	}
	if input.WeeklyHours == nil || *input.WeeklyHours < 0 {
		http.Error(w, "weeklyHours must be a finite non-negative number", http.StatusBadRequest)
		return
	}

	var updated struct {
		ID          int32   `json:"id"`
		WeeklyHours float64 `json:"weeklyHours"`
	}
	err = s.db.QueryRow(r.Context(), `
		UPDATE people SET weekly_hours = $1 WHERE id = $2
		RETURNING id, weekly_hours`, *input.WeeklyHours, int32(id)).Scan(&updated.ID, &updated.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "person not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("update weekly hours for person %d: %v", id, err)
		http.Error(w, "could not update weekly hours", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

