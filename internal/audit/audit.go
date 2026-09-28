// Package audit records who did what to which entity.
package audit

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/store"
)

type impersonatorKey struct{}

// WithImpersonator marks ctx as a request made by a platform admin acting as
// another user. Record then attributes every entry to both people.
func WithImpersonator(ctx context.Context, adminID uuid.UUID) context.Context {
	return context.WithValue(ctx, impersonatorKey{}, adminID)
}

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
	// Entries where the admin is the actor (e.g. ending the impersonation) need no tag.
	if adminID, ok := ctx.Value(impersonatorKey{}).(uuid.UUID); ok && (e.ActorUserID == nil || *e.ActorUserID != adminID) {
		m := make(map[string]any, len(e.Metadata)+1)
		for k, v := range e.Metadata {
			m[k] = v
		}
		m["impersonated_by"] = adminID.String()
		e.Metadata = m
	}
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
