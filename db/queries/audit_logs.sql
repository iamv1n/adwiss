-- name: InsertAuditLog :exec
INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListAuditLogs :many
SELECT * FROM audit_logs
WHERE organization_id = $1
ORDER BY created_at DESC
LIMIT $2;
