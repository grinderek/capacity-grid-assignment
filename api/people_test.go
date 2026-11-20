package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHandleUpdatePersonInvalidRequest(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/people/{id}", (&server{}).handleUpdatePerson)
	tests := []struct {
		name string
		id   string
		body string
	}{
		{"invalid ID", "abc", `{"weeklyHours":45}`},
		{"zero ID", "0", `{"weeklyHours":45}`},
		{"negative ID", "-1", `{"weeklyHours":45}`},
		{"ID outside serial range", "2147483648", `{"weeklyHours":45}`},
		{"missing field", "4", `{}`},
		{"null field", "4", `{"weeklyHours":null}`},
		{"null body", "4", `null`},
		{"negative hours", "4", `{"weeklyHours":-0.5}`},
		{"numeric string", "4", `{"weeklyHours":"45"}`},
		{"overflowing hours", "4", `{"weeklyHours":1e309}`},
		{"invalid JSON", "4", `{"weeklyHours":45`},
		{"second JSON value", "4", `{"weeklyHours":45} {}`},
		{"trailing garbage", "4", `{"weeklyHours":45}garbage`},
		{"oversized body", "4", `{"weeklyHours":45}` + strings.Repeat(" ", 4096)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPatch, "/api/people/"+tt.id, strings.NewReader(tt.body))
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			if w.Code != http.StatusBadRequest {
				t.Errorf("got HTTP %d with %q, want HTTP 400", w.Code, w.Body.String())
			}
		})
	}
}

func TestHandleUpdatePersonPostgres(t *testing.T) {
	dsn := os.Getenv("CAPACITY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set CAPACITY_TEST_DATABASE_URL to a database loaded with the assignment schema")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	// The handlers share one connection and only see the test's temporary tables.
	config.MaxConns = 1
	config.ConnConfig.RuntimeParams["search_path"] = "pg_temp"
	db, err := pgxpool.NewWithConfig(t.Context(), config)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(t.Context(), `
		CREATE TEMP TABLE people (LIKE public.people INCLUDING INDEXES);
		CREATE TEMP TABLE assignments (LIKE public.assignments);
		INSERT INTO people (id, name, weekly_hours) VALUES (4, 'Dee', 40), (5, 'Eli', 30);
		INSERT INTO assignments (id, person_id, project_id, start_date, end_date, hours_per_day)
		VALUES (1, 4, 1, '2026-01-05', '2026-01-16', 6),
		       (2, 5, 1, '2026-01-05', '2026-01-16', 4);
		ALTER TABLE people ADD CHECK (weekly_hours <= 48);`)
	if err != nil {
		t.Fatal(err)
	}

	s := &server{db: db}
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/people/{id}", s.handleUpdatePerson)
	mux.HandleFunc("GET /api/capacity", s.handleCapacity)
	request := func(method, path, body string, status int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequestWithContext(t.Context(), method, path, strings.NewReader(body))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s got HTTP %d with %q, want HTTP %d", method, path, w.Code, w.Body.String(), status)
		}
		return w
	}

	ranges := []string{
		"/api/capacity?from=2026-01-05&to=2026-01-16",
		"/api/capacity?from=2026-01-14&to=2026-01-23",
	}
	getCapacity := func(path string) capacityResponse {
		t.Helper()
		w := request(http.MethodGet, path, "", http.StatusOK)
		var response capacityResponse
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response
	}
	before := make([]capacityResponse, len(ranges))
	for i, path := range ranges {
		before[i] = getCapacity(path)
		if len(before[i].People) != 2 || before[i].People[0].ID != 4 || before[i].People[0].AllocatedHours[0] <= 0 {
			t.Fatalf("unexpected capacity fixture for %s: %+v", path, before[i])
		}
	}

	for _, tt := range []struct {
		body string
		want float64
	}{
		{`{"weeklyHours":45}`, 45},
		{`{"weeklyHours":37.1}`, 37.1},
		{`{"weeklyHours":0}`, 0},
	} {
		w := request(http.MethodPatch, "/api/people/4", tt.body, http.StatusOK)
		var updated map[string]float64
		if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
			t.Fatal(err)
		}
		if want := (map[string]float64{"id": 4, "weeklyHours": tt.want}); !reflect.DeepEqual(updated, want) {
			t.Fatalf("PATCH returned %v, want %v", updated, want)
		}
		for i, path := range ranges {
			before[i].People[0].WeeklyHours = tt.want
			if got := getCapacity(path); !reflect.DeepEqual(got, before[i]) {
				t.Errorf("GET %s after PATCH returned %+v, want %+v", path, got, before[i])
			}
		}
	}

	request(http.MethodPatch, "/api/people/999", `{"weeklyHours":45}`, http.StatusNotFound)
	request(http.MethodPatch, "/api/people/4", `{"weeklyHours":50}`, http.StatusInternalServerError)
	if got := getCapacity(ranges[0]); !reflect.DeepEqual(got, before[0]) {
		t.Errorf("failed PATCH changed capacity: got %+v, want %+v", got, before[0])
	}
}

