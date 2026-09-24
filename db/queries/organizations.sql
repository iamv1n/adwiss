-- name: CreateOrganization :one
INSERT INTO organizations (name, slug)
VALUES ($1, $2)
RETURNING *;

-- name: GetOrganization :one
SELECT * FROM organizations WHERE id = $1;

-- name: ListOrganizationsForUser :many
SELECT sqlc.embed(organizations), organization_users.role
FROM organizations
JOIN organization_users ON organization_users.organization_id = organizations.id
WHERE organization_users.user_id = $1
ORDER BY organizations.name;

-- name: AddOrganizationUser :exec
INSERT INTO organization_users (organization_id, user_id, role)
VALUES ($1, $2, $3);

-- name: GetMembership :one
SELECT * FROM organization_users
WHERE organization_id = $1 AND user_id = $2;

-- name: ListMembers :many
SELECT users.id, users.email, users.name, organization_users.role, organization_users.created_at
FROM organization_users
JOIN users ON users.id = organization_users.user_id
WHERE organization_users.organization_id = $1
ORDER BY organization_users.created_at;

-- name: UpdateMemberRole :exec
UPDATE organization_users
SET role = $3, updated_at = now()
WHERE organization_id = $1 AND user_id = $2;

-- name: RemoveMember :exec
DELETE FROM organization_users
WHERE organization_id = $1 AND user_id = $2;

-- name: CountOwners :one
SELECT count(*) FROM organization_users
WHERE organization_id = $1 AND role = 'owner';

-- name: LockOrganization :exec
-- Serialises membership changes so the last-owner check cannot race.
SELECT id FROM organizations WHERE id = $1 FOR UPDATE;

-- name: IsMemberByEmail :one
SELECT EXISTS (
    SELECT 1 FROM organization_users
    JOIN users ON users.id = organization_users.user_id
    WHERE organization_users.organization_id = $1 AND users.email = $2
);
