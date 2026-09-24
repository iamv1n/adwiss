-- name: CreateInvitation :one
INSERT INTO organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListOpenInvitations :many
SELECT * FROM organization_invitations
WHERE organization_id = $1
  AND accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > now()
ORDER BY created_at DESC;

-- name: GetOpenInvitationByTokenHash :one
SELECT * FROM organization_invitations
WHERE token_hash = $1
  AND accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > now()
FOR UPDATE;

-- name: MarkInvitationAccepted :exec
UPDATE organization_invitations SET accepted_at = now() WHERE id = $1;

-- name: RevokeInvitation :execrows
UPDATE organization_invitations
SET revoked_at = now()
WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL;

-- name: RevokeExpiredOpenInvitation :exec
-- Frees the (organization, email) slot held by an expired invitation.
UPDATE organization_invitations
SET revoked_at = now()
WHERE organization_id = $1 AND email = $2
  AND accepted_at IS NULL AND revoked_at IS NULL
  AND expires_at <= now();
