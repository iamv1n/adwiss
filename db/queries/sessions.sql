-- name: CreateSession :one
INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CreateImpersonationSession :one
INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at, impersonator_user_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetSessionUserByTokenHash :one
SELECT
    sessions.id AS session_id,
    sessions.expires_at,
    sessions.last_seen_at,
    sessions.impersonator_user_id,
    sqlc.embed(users)
FROM sessions
JOIN users ON users.id = sessions.user_id
WHERE sessions.token_hash = $1
  AND sessions.expires_at > now();

-- name: TouchSession :exec
UPDATE sessions SET last_seen_at = now() WHERE id = $1;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = $1;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions WHERE expires_at <= now();

-- name: DeleteUserSessions :execrows
DELETE FROM sessions WHERE user_id = $1;
