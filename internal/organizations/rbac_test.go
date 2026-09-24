package organizations

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAtLeast(t *testing.T) {
	assert.True(t, AtLeast(RoleOwner, RoleAdmin))
	assert.True(t, AtLeast(RoleAdmin, RoleAdmin))
	assert.False(t, AtLeast(RoleMember, RoleAdmin))
	assert.False(t, AtLeast(RoleAdmin, RoleOwner))
	assert.False(t, AtLeast(Role("bogus"), RoleMember))
	assert.False(t, AtLeast(RoleOwner, Role("bogus")))
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Acme Inc.":         "acme-inc",
		"  Hello   World  ": "hello-world",
		"ÜNICODE only":      "nicode-only",
		"!!!":               "org",
		"a-very-long-name-that-keeps-going-and-going-past-the-limit": "a-very-long-name-that-keeps-going-and-going-past",
	}
	for in, want := range cases {
		assert.Equal(t, want, slugify(in), in)
	}
}
