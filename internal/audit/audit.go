// Package audit records who did what to which entity.
package audit

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/store"
)

type Entry struct {
	OrganizationID *uuid.UUID
	ActorUserID    *uuid.UUID
	Action         string
	EntityType     string
	EntityID       string
	Metadata       map[string]any
}

// Record writes an audit log entry. Pass transaction-scoped queries so the entry
// commits or rolls back together with the change it describes.
func Record(ctx context.Context, q *store.Queries, e Entry) error {
	meta := []byte("{}")
	if len(e.Metadata) > 0 {
		var err error
		if meta, err = json.Marshal(e.Metadata); err != nil {
			return err
		}
	}
	return q.InsertAuditLog(ctx, store.InsertAuditLogParams{
		OrganizationID: e.OrganizationID,
		ActorUserID:    e.ActorUserID,
		Action:         e.Action,
		EntityType:     e.EntityType,
		EntityID:       e.EntityID,
		Metadata:       meta,
	})
}
