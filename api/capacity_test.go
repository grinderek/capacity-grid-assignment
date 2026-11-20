package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHandleCapacityInvalidRange(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string
	}{
		{"missing from", "to=2026-01-16", "from must be"},
		{"missing to", "from=2025-12-29", "to must be"},
		{"empty to", "from=2025-12-29&to=", "to must be"},
		{"invalid date", "from=2026-02-29&to=2026-03-01", "from must be"},
		{"reversed range", "from=2026-01-16&to=2025-12-29", "from must be on or before to"},
		{"repeated from", "from=2025-12-29&from=2026-01-01&to=2026-01-16", "from must be"},
		{"malformed query", "from=%FF%XY&to=2026-01-16", "invalid query parameters"},
	}

	s := &server{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/capacity?"+tt.query, nil)
			w := httptest.NewRecorder()
			s.handleCapacity(w, r)

			if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), tt.want) {
				t.Errorf("got HTTP %d with %q, want HTTP 400 containing %q", w.Code, w.Body.String(), tt.want)
			}
		})
	}
}

func TestHandleCapacitySeed(t *testing.T) {
	dsn := os.Getenv("CAPACITY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set CAPACITY_TEST_DATABASE_URL to the database loaded with the assignment seed")
	}
	db, err := pgxpool.New(t.Context(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := &server{db: db}

	tests := []struct {
		name     string
		query    string
		weeks    []string
		anaHours []float64
		eliHours []float64
	}{
		{
			name:     "default range crosses a calendar year",
			query:    "from=2025-12-29&to=2026-01-16",
			weeks:    []string{"2025-12-29", "2026-01-05", "2026-01-12"},
			anaHours: []float64{40, 0, 30},
			eliHours: []float64{0, 20, 0},
		},
		{
			name:     "partial week keeps full capacity",
			query:    "from=2025-12-31&to=2026-01-02",
			weeks:    []string{"2025-12-29"},
			anaHours: []float64{24},
			eliHours: []float64{0},
		},
		{
			name:     "weekend only",
			query:    "from=2026-01-03&to=2026-01-04",
			weeks:    []string{"2025-12-29"},
			anaHours: []float64{0},
			eliHours: []float64{0},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/capacity?"+tt.query, nil)
			w := httptest.NewRecorder()
			s.handleCapacity(w, r)
			if w.Code != http.StatusOK {
				t.Fatalf("got HTTP %d with %q, want HTTP 200", w.Code, w.Body.String())
			}

			var got capacityResponse
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(got.Weeks, tt.weeks) {
				t.Errorf("weeks = %v, want %v", got.Weeks, tt.weeks)
			}
			if len(got.People) != 500 {
				t.Errorf("got %d people, want all 500 from the seed", len(got.People))
			}
			for _, want := range []personCapacity{
				{ID: 1, WeeklyHours: 40, AllocatedHours: tt.anaHours},
				{ID: 5, WeeklyHours: 0, AllocatedHours: tt.eliHours},
			} {
				index := slices.IndexFunc(got.People, func(person personCapacity) bool { return person.ID == want.ID })
				if index < 0 {
					t.Errorf("person %d is missing", want.ID)
					continue
				}
				person := got.People[index]
				if person.WeeklyHours != want.WeeklyHours || !slices.Equal(person.AllocatedHours, want.AllocatedHours) {
					t.Errorf("person %d has %v allocated and %v weekly hours, want %v and %v",
						person.ID, person.AllocatedHours, person.WeeklyHours, want.AllocatedHours, want.WeeklyHours)
				}
			}
		})
	}
}

