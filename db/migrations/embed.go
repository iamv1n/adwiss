// Package migrations embeds the SQL migration files so binaries can apply them.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
