package providers

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/iamv1n/adwise/internal/ads"
)

const microsPerUnit = 1_000_000

// DecimalToMicros converts a decimal amount in major currency units (for
// example Meta's insights spend "12.345") to micros without going through
// float64. Digits beyond the sixth decimal place are rounded half away from zero.
func DecimalToMicros(s string) (ads.Micros, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	neg := false
	switch s[0] {
	case '-':
		neg, s = true, s[1:]
	case '+':
		s = s[1:]
	}
	if strings.ContainsAny(s, "eE") {
		// Scientific notation is rare; fall back to float parsing.
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid decimal %q", s)
		}
		m := FloatToMicros(f)
		if neg {
			m = -m
		}
		return m, nil
	}
	intPart, frac, _ := strings.Cut(s, ".")
	if intPart == "" && frac == "" {
		return 0, fmt.Errorf("invalid decimal %q", s)
	}
	if intPart == "" {
		intPart = "0"
	}
	whole, err := strconv.ParseInt(intPart, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid decimal %q", s)
	}
	roundUp := false
	if len(frac) > 6 {
		if frac[6] < '0' || frac[6] > '9' {
			return 0, fmt.Errorf("invalid decimal %q", s)
		}
		roundUp = frac[6] >= '5'
		frac = frac[:6]
	}
	frac += strings.Repeat("0", 6-len(frac))
	fracV, err := strconv.ParseInt(frac, 10, 64)
	if err != nil || fracV < 0 {
		return 0, fmt.Errorf("invalid decimal %q", s)
	}
	if whole > (math.MaxInt64-fracV-1)/microsPerUnit {
		return 0, fmt.Errorf("decimal %q overflows micros", s)
	}
	m := whole*microsPerUnit + fracV
	if roundUp {
		m++
	}
	if neg {
		m = -m
	}
	return m, nil
}

// FloatToMicros converts a float amount in major units to micros, rounding to
// the nearest micro. Use only when the provider already returns a double
// (Google's metrics.conversions_value).
func FloatToMicros(f float64) ads.Micros {
	return ads.Micros(math.Round(f * microsPerUnit))
}

// MinorToMicros converts an amount in provider minor units to micros, where
// offset is the number of minor units per major unit (100 for USD, 1 for JPY).
func MinorToMicros(minor, offset int64) ads.Micros {
	if offset <= 0 {
		offset = 100
	}
	return minor * (microsPerUnit / offset)
}

// MicrosToMinor converts micros to provider minor units, rounding half away
// from zero to the nearest minor unit.
func MicrosToMinor(m ads.Micros, offset int64) int64 {
	if offset <= 0 {
		offset = 100
	}
	per := microsPerUnit / offset
	if m < 0 {
		return -((-m + per/2) / per)
	}
	return (m + per/2) / per
}
