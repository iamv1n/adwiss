package automation

import (
	"fmt"
	"time"
)

// Time slots. A schedule's clock is local: hour h on weekday d in loc. Offsets
// that are not whole hours (Asia/Kolkata +05:30, Pacific/Chatham +12:45) and
// DST transitions are handled by working in the location, never by truncating
// UTC timestamps.

// LoadLocation resolves an IANA timezone name, defaulting to UTC.
func LoadLocation(name string) (*time.Location, error) {
	if name == "" {
		return time.UTC, nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("unknown timezone %q", name)
	}
	return loc, nil
}

// HourStart returns the start of the local hour containing t.
func HourStart(t time.Time, loc *time.Location) time.Time {
	l := t.In(loc)
	return l.Add(-time.Duration(l.Minute())*time.Minute - time.Duration(l.Second())*time.Second - time.Duration(l.Nanosecond()))
}

// Cell returns the grid position (0 = Monday) of t in loc.
func Cell(t time.Time, loc *time.Location) (weekday, hour int) {
	l := t.In(loc)
	return (int(l.Weekday()) + 6) % 7, l.Hour()
}

// ValueAt returns the grid value in effect at t in loc.
func (g Grid) ValueAt(t time.Time, loc *time.Location) float64 {
	d, h := Cell(t, loc)
	return g[d][h]
}

// SlotStart returns the start of the contiguous run of equal grid values that
// contains t: the moment the schedule last changed what it wants. It is the
// time component of a schedule's idempotency key, so one run of "off" hours
// produces at most one pause per target, even in dry-run mode where the
// entity's state never changes. For a uniform grid it is the start of the
// local week.
func (g Grid) SlotStart(t time.Time, loc *time.Location) time.Time {
	cur := HourStart(t, loc)
	v := g.ValueAt(cur, loc)
	for range 7 * 24 {
		prev := HourStart(cur.Add(-time.Hour), loc)
		if g.ValueAt(prev, loc) != v {
			return cur
		}
		cur = prev
	}
	// Uniform grid: anchor to local Monday 00:00.
	l := t.In(loc)
	d, _ := Cell(t, loc)
	return time.Date(l.Year(), l.Month(), l.Day()-d, 0, 0, 0, 0, loc)
}

// Transition is a point where a schedule's grid value changes.
type Transition struct {
	At    time.Time `json:"at"`
	Value float64   `json:"value"`
}

// Transitions returns the value in effect at from (first element) and every
// change within the following window, hour by hour in loc.
func (g Grid) Transitions(from time.Time, window time.Duration, loc *time.Location) []Transition {
	cur := HourStart(from, loc)
	v := g.ValueAt(cur, loc)
	out := []Transition{{At: from, Value: v}}
	end := from.Add(window)
	for {
		cur = HourStart(cur.Add(time.Hour), loc)
		if !cur.Before(end) {
			return out
		}
		if nv := g.ValueAt(cur, loc); nv != v {
			out = append(out, Transition{At: cur, Value: nv})
			v = nv
		}
	}
}

// DescribeValue renders a grid value for people.
func DescribeValue(v float64) string {
	switch {
	case v == 0:
		return "off"
	case v == 1:
		return "on"
	case v > 1:
		return fmt.Sprintf("budget +%.0f%%", (v-1)*100)
	default:
		return fmt.Sprintf("budget −%.0f%%", (1-v)*100)
	}
}
