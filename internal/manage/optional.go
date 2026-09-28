package manage

import "encoding/json"

// Optional distinguishes an absent JSON field (Set=false) from an explicit
// null (Set=true, Null=true) and a value.
type Optional[T any] struct {
	Set   bool
	Null  bool
	Value T
}

// Some returns an Optional holding v.
func Some[T any](v T) Optional[T] { return Optional[T]{Set: true, Value: v} }

// Null returns an Optional that clears the field.
func Null[T any]() Optional[T] { return Optional[T]{Set: true, Null: true} }

func (o *Optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}

func (o Optional[T]) MarshalJSON() ([]byte, error) {
	if !o.Set || o.Null {
		return []byte("null"), nil
	}
	return json.Marshal(o.Value)
}

// Ptr returns the value when set and not null.
func (o Optional[T]) Ptr() *T {
	if !o.Set || o.Null {
		return nil
	}
	v := o.Value
	return &v
}
