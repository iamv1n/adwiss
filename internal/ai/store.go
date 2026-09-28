package ai

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// store holds the package's SQL (pgx directly, like internal/automation).
type store struct{ pool *pgxpool.Pool }

var errNotFound = errors.New("not found")

type Conversation struct {
	ID        uuid.UUID `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID        uuid.UUID `json:"id"`
	Role      string    `json:"role"`
	Text      string    `json:"text"`
	Tools     []string  `json:"tools"`
	Error     bool      `json:"error"`
	CreatedAt time.Time `json:"created_at"`
}

func (st *store) createConversation(ctx context.Context, orgID, userID uuid.UUID, title string) (Conversation, error) {
	var c Conversation
	err := st.pool.QueryRow(ctx, `INSERT INTO ai_conversations (organization_id, user_id, title) VALUES ($1, $2, $3)
		RETURNING id, title, created_at, updated_at`, orgID, userID, title).Scan(&c.ID, &c.Title, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

// conversation returns a conversation only to the user who owns it.
func (st *store) conversation(ctx context.Context, orgID, userID, id uuid.UUID) (Conversation, error) {
	var c Conversation
	err := st.pool.QueryRow(ctx, `SELECT id, title, created_at, updated_at FROM ai_conversations
		WHERE id = $1 AND organization_id = $2 AND user_id = $3`, id, orgID, userID).Scan(&c.ID, &c.Title, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, errNotFound
	}
	return c, err
}

func (st *store) listConversations(ctx context.Context, orgID, userID uuid.UUID, limit int) ([]Conversation, error) {
	rows, err := st.pool.Query(ctx, `SELECT id, title, created_at, updated_at FROM ai_conversations
		WHERE organization_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT $3`, orgID, userID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Conversation, error) {
		var c Conversation
		err := r.Scan(&c.ID, &c.Title, &c.CreatedAt, &c.UpdatedAt)
		return c, err
	})
}

func (st *store) deleteConversation(ctx context.Context, orgID, userID, id uuid.UUID) error {
	tag, err := st.pool.Exec(ctx, `DELETE FROM ai_conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3`, id, orgID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return nil
}

// messages returns the last limit messages of a conversation, oldest first.
func (st *store) messages(ctx context.Context, conversationID uuid.UUID, limit int) ([]Message, error) {
	rows, err := st.pool.Query(ctx, `SELECT id, role, text, tools, error, created_at FROM (
			SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2
		) m ORDER BY created_at, id`, conversationID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Message, error) {
		var m Message
		err := r.Scan(&m.ID, &m.Role, &m.Text, &m.Tools, &m.Error, &m.CreatedAt)
		return m, err
	})
}

type newMessage struct {
	ConversationID uuid.UUID
	OrganizationID uuid.UUID
	Role           string
	Text           string
	Tools          []string
	Error          bool
	Model          string
	Usage          Usage
}

// addMessage appends a message and bumps the conversation's updated_at.
func (st *store) addMessage(ctx context.Context, m newMessage) (Message, error) {
	if m.Tools == nil {
		m.Tools = []string{}
	}
	var out Message
	err := st.pool.QueryRow(ctx, `WITH msg AS (
			INSERT INTO ai_messages (conversation_id, organization_id, role, text, tools, error, model,
			                         input_tokens, output_tokens, cache_read_tokens)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id, role, text, tools, error, created_at
		), bump AS (
			UPDATE ai_conversations SET updated_at = now() WHERE id = $1
		)
		SELECT id, role, text, tools, error, created_at FROM msg`,
		m.ConversationID, m.OrganizationID, m.Role, m.Text, m.Tools, m.Error, m.Model,
		m.Usage.InputTokens, m.Usage.OutputTokens, m.Usage.CacheRead,
	).Scan(&out.ID, &out.Role, &out.Text, &out.Tools, &out.Error, &out.CreatedAt)
	return out, err
}

// tokensSince is the org's model usage (input + output) since t.
func (st *store) tokensSince(ctx context.Context, orgID uuid.UUID, t time.Time) (int64, error) {
	var n int64
	err := st.pool.QueryRow(ctx, `SELECT COALESCE(sum(input_tokens + output_tokens), 0)::bigint FROM ai_messages
		WHERE organization_id = $1 AND role = 'assistant' AND created_at >= $2`, orgID, t).Scan(&n)
	return n, err
}
