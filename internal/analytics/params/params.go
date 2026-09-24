// Package params parses and validates the query parameters shared by the
// entity and analytics endpoints, with consistent error codes:
//
//   - 400 invalid_date_range: from/to malformed, from > to, or span > MaxDays
//   - 400 invalid_query: any other bad parameter; Fields maps name → reason
package params

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

const (
	// MaxDays is the longest date range any endpoint accepts.
	MaxDays = 400
	// DefaultDays is the range used by analytics endpoints when from/to are omitted.
	DefaultDays = 30

	DefaultLimit = 50
	MaxLimit     = 200
)

const dateLayout = "2006-01-02"

// DateRange is an inclusive range of account-local calendar dates, held as
// UTC midnights.
type DateRange struct {
	From time.Time
	To   time.Time
}

// Days is the number of days in the range, inclusive.
func (r DateRange) Days() int { return int(r.To.Sub(r.From).Hours()/24) + 1 }

// Dates lists every date in the range.
func (r DateRange) Dates() []time.Time {
	out := make([]time.Time, 0, r.Days())
	for d := r.From; !d.After(r.To); d = d.AddDate(0, 0, 1) {
		out = append(out, d)
	}
	return out
}

// JSON is the wire form used in responses.
func (r DateRange) JSON() map[string]any {
	return map[string]any{"from": r.From.Format(dateLayout), "to": r.To.Format(dateLayout), "days": r.Days()}
}

// Invalid returns a 400 invalid_query error for one parameter.
func Invalid(name, reason string) *httpx.Error {
	e := httpx.NewError(http.StatusBadRequest, "invalid_query", "invalid query parameter: "+name)
	e.Fields = map[string]string{name: reason}
	return e
}

func invalidRange(msg string) *httpx.Error {
	return httpx.NewError(http.StatusBadRequest, "invalid_date_range", msg)
}

// Today is the reference date for defaults; replaceable in tests.
var Today = func() time.Time {
	y, m, d := time.Now().UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// OptionalDateRange parses from/to. Both absent returns nil; exactly one
// present is an error.
func OptionalDateRange(q url.Values) (*DateRange, error) {
	from, to := q.Get("from"), q.Get("to")
	if from == "" && to == "" {
		return nil, nil
	}
	if from == "" || to == "" {
		return nil, invalidRange("from and to must be given together (YYYY-MM-DD)")
	}
	r, err := parseRange(from, to)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// DateRangeOrDefault parses from/to, defaulting to the DefaultDays days
// ending today (UTC) when both are omitted.
func DateRangeOrDefault(q url.Values) (DateRange, error) {
	r, err := OptionalDateRange(q)
	if err != nil {
		return DateRange{}, err
	}
	if r == nil {
		to := Today()
		return DateRange{From: to.AddDate(0, 0, -(DefaultDays - 1)), To: to}, nil
	}
	return *r, nil
}

func parseRange(from, to string) (DateRange, error) {
	f, err := time.Parse(dateLayout, from)
	if err != nil {
		return DateRange{}, invalidRange("from must be a date in YYYY-MM-DD format")
	}
	t, err := time.Parse(dateLayout, to)
	if err != nil {
		return DateRange{}, invalidRange("to must be a date in YYYY-MM-DD format")
	}
	if t.Before(f) {
		return DateRange{}, invalidRange("from must not be after to")
	}
	r := DateRange{From: f, To: t}
	if r.Days() > MaxDays {
		return DateRange{}, invalidRange("date range must not exceed " + strconv.Itoa(MaxDays) + " days")
	}
	return r, nil
}

// Page is limit/offset pagination, used by every list endpoint.
type Page struct {
	Limit  int
	Offset int
}

func ParsePage(q url.Values) (Page, error) {
	p := Page{Limit: DefaultLimit}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > MaxLimit {
			return p, Invalid("limit", "must be an integer between 1 and "+strconv.Itoa(MaxLimit))
		}
		p.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return p, Invalid("offset", "must be a non-negative integer")
		}
		p.Offset = n
	}
	return p, nil
}

// PageJSON is the pagination block of list responses.
func PageJSON(p Page, total int64) map[string]any {
	return map[string]any{"limit": p.Limit, "offset": p.Offset, "total": total}
}

func UUID(q url.Values, name string) (*uuid.UUID, error) {
	v := q.Get(name)
	if v == "" {
		return nil, nil
	}
	id, err := uuid.Parse(v)
	if err != nil {
		return nil, Invalid(name, "must be a UUID")
	}
	return &id, nil
}

func Provider(q url.Values) (ads.Provider, error) {
	switch v := ads.Provider(q.Get("provider")); v {
	case "", ads.ProviderMeta, ads.ProviderGoogle:
		return v, nil
	default:
		return "", Invalid("provider", "must be meta or google")
	}
}

func Status(q url.Values) (ads.Status, error) {
	switch v := ads.Status(q.Get("status")); v {
	case "", ads.StatusActive, ads.StatusPaused, ads.StatusArchived, ads.StatusDeleted, ads.StatusUnknown:
		return v, nil
	default:
		return "", Invalid("status", "must be one of active, paused, archived, deleted, unknown")
	}
}

func Currency(q url.Values) (string, error) {
	v := strings.ToUpper(strings.TrimSpace(q.Get("currency")))
	if v == "" {
		return "", nil
	}
	if len(v) != 3 || strings.Trim(v, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") != "" {
		return "", Invalid("currency", "must be an ISO 4217 code")
	}
	return v, nil
}

// Search returns the trimmed search string (max 200 characters).
func Search(q url.Values) (string, error) {
	v := strings.TrimSpace(q.Get("search"))
	if len(v) > 200 {
		return "", Invalid("search", "must be at most 200 characters")
	}
	return v, nil
}

// LikePattern escapes s for use inside an ILIKE '%…%' pattern.
func LikePattern(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// OneOf validates an enumerated parameter, returning def when absent.
func OneOf(q url.Values, name, def string, allowed ...string) (string, error) {
	v := q.Get(name)
	if v == "" {
		return def, nil
	}
	for _, a := range allowed {
		if v == a {
			return v, nil
		}
	}
	return "", Invalid(name, "must be one of "+strings.Join(allowed, ", "))
}

// Float parses a non-negative decimal parameter, returning def when absent.
func Float(q url.Values, name string, def float64) (float64, error) {
	v := q.Get(name)
	if v == "" {
		return def, nil
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f < 0 || f != f || f > 1e15 {
		return 0, Invalid(name, "must be a non-negative number")
	}
	return f, nil
}
