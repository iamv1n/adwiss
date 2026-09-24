package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

// FlexInt decodes an integer sent either as a JSON number or a JSON string
// (proto3 JSON encodes int64 as strings; Graph API returns numeric strings).
type FlexInt int64

func (f *FlexInt) UnmarshalJSON(b []byte) error {
	b = bytes.Trim(b, `"`)
	if len(b) == 0 || string(b) == "null" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseInt(string(b), 10, 64)
	if err != nil {
		// Some counters arrive as "12.0".
		fv, ferr := strconv.ParseFloat(string(b), 64)
		if ferr != nil {
			return fmt.Errorf("invalid integer %s", b)
		}
		v = int64(fv)
	}
	*f = FlexInt(v)
	return nil
}

// FlexFloat decodes a float sent as a JSON number or string.
type FlexFloat float64

func (f *FlexFloat) UnmarshalJSON(b []byte) error {
	b = bytes.Trim(b, `"`)
	if len(b) == 0 || string(b) == "null" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseFloat(string(b), 64)
	if err != nil {
		return fmt.Errorf("invalid number %s", b)
	}
	*f = FlexFloat(v)
	return nil
}

// FlexString decodes a JSON string or number into a string (IDs).
type FlexString string

func (f *FlexString) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*f = ""
		return nil
	}
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*f = FlexString(s)
		return nil
	}
	*f = FlexString(b)
	return nil
}

// Sleep waits for d or until ctx is done. Adapters take it as a field so
// tests can replace it.
func Sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// Backoff returns an exponential delay for attempt (0-based), capped at max.
func Backoff(attempt int, base, max time.Duration) time.Duration {
	d := base << min(attempt, 16)
	if d <= 0 || d > max {
		return max
	}
	return d
}
