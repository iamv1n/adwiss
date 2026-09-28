-- name: CreateUser :one
INSERT INTO users (email, name, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: SetPlatformAdmin :one
UPDATE users SET is_platform_admin = $2, updated_at = now()
WHERE email = $1
RETURNING *;
