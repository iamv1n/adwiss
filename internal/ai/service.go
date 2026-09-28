package ai

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

const (
	listLimit     = 50
	titleMaxRunes = 80
)

var (
	ErrConversationNotFound = httpx.NewError(http.StatusNotFound, "conversation_not_found", "conversation not found")
	ErrDisabled             = httpx.NewError(http.StatusServiceUnavailable, "ai_disabled", "the AI analyst is not configured on this server")
	ErrDailyLimit           = httpx.NewError(http.StatusTooManyRequests, "ai_daily_limit", "your organization has reached today's AI usage limit; it resets at midnight UTC")
)

// Service stores conversations and answers questions in them. Conversations
// work without an agent (list, read, delete); asking needs one.
type Service struct {
	st     *store
	agent  *Agent // nil when no API key is configured
	model  string
	daily  int64 // tokens per org per UTC day; 0 = unlimited
	logger *slog.Logger
	now    func() time.Time
}

func NewService(db *database.DB, agent *Agent, model string, dailyTokens int64, logger *slog.Logger) *Service {
	return &Service{st: &store{pool: db.Pool}, agent: agent, model: model, daily: dailyTokens, logger: logger, now: time.Now}
}

func (s *Service) Enabled() bool { return s.agent != nil }

type ConversationDetail struct {
	Conversation
	Messages []Message `json:"messages"`
}

func (s *Service) List(ctx context.Context, m organizations.Membership) ([]Conversation, error) {
	return s.st.listConversations(ctx, m.OrganizationID, m.UserID, listLimit)
}

func (s *Service) Get(ctx context.Context, m organizations.Membership, id uuid.UUID) (ConversationDetail, error) {
	c, err := s.st.conversation(ctx, m.OrganizationID, m.UserID, id)
	if errors.Is(err, errNotFound) {
		return ConversationDetail{}, ErrConversationNotFound
	}
	if err != nil {
		return ConversationDetail{}, err
	}
	msgs, err := s.st.messages(ctx, id, 500)
	if err != nil {
		return ConversationDetail{}, err
	}
	return ConversationDetail{Conversation: c, Messages: msgs}, nil
}

func (s *Service) Delete(ctx context.Context, m organizations.Membership, id uuid.UUID) error {
	err := s.st.deleteConversation(ctx, m.OrganizationID, m.UserID, id)
	if errors.Is(err, errNotFound) {
		return ErrConversationNotFound
	}
	return err
}

// Prepare checks a question can be asked and returns the conversation it
// goes into, creating one when conversationID is nil. It runs before the
// response starts streaming, so its errors are plain HTTP errors.
func (s *Service) Prepare(ctx context.Context, m organizations.Membership, conversationID *uuid.UUID, question string) (Conversation, error) {
	if s.agent == nil {
		return Conversation{}, ErrDisabled
	}
	if s.daily > 0 {
		used, err := s.st.tokensSince(ctx, m.OrganizationID, s.dayStart())
		if err != nil {
			return Conversation{}, err
		}
		if used >= s.daily {
			return Conversation{}, ErrDailyLimit
		}
	}
	if conversationID != nil {
		c, err := s.st.conversation(ctx, m.OrganizationID, m.UserID, *conversationID)
		if errors.Is(err, errNotFound) {
			return c, ErrConversationNotFound
		}
		return c, err
	}
	return s.st.createConversation(ctx, m.OrganizationID, m.UserID, title(question))
}

// Ask saves the question, answers it with the conversation's history, and
// saves the answer, even when the answer failed part way.
func (s *Service) Ask(ctx context.Context, m organizations.Membership, c Conversation, question string, emit func(Event)) error {
	prior, err := s.st.messages(ctx, c.ID, maxHistory-1)
	if err != nil {
		return err
	}
	if _, err := s.st.addMessage(ctx, newMessage{ConversationID: c.ID, OrganizationID: m.OrganizationID, Role: "user", Text: question}); err != nil {
		return err
	}
	var history []Turn
	for _, p := range prior {
		if p.Error && p.Role == "assistant" {
			continue // a failed answer is not context worth resending
		}
		history = append(history, Turn{Role: p.Role, Text: p.Text})
	}
	history = append(history, Turn{Role: "user", Text: question})

	res, chatErr := s.agent.Chat(ctx, m, dropUnanswered(history), emit)
	failed := res.Failed || chatErr != nil
	text := res.Text
	if chatErr != nil {
		s.logger.ErrorContext(ctx, "ai chat failed", "org_id", m.OrganizationID, "conversation_id", c.ID, "err", chatErr)
		const msg = "Something went wrong while answering. Please try again."
		emit(Event{Type: "error", Text: msg})
		if text != "" {
			text += "\n\n"
		}
		text += msg
	}
	// Saved on a fresh context: the answer is kept even if the client left.
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if _, err := s.st.addMessage(saveCtx, newMessage{
		ConversationID: c.ID, OrganizationID: m.OrganizationID, Role: "assistant", Text: text,
		Tools: res.Tools, Error: failed, Model: s.model, Usage: res.Usage,
	}); err != nil {
		s.logger.ErrorContext(ctx, "ai save answer failed", "conversation_id", c.ID, "err", err)
	}
	emit(Event{Type: "done", Usage: &res.Usage})
	return nil
}

func (s *Service) dayStart() time.Time {
	y, mo, d := s.now().UTC().Date()
	return time.Date(y, mo, d, 0, 0, 0, 0, time.UTC)
}

// dropUnanswered removes a user turn left without an answer (for example a
// failed one that was skipped) so the history alternates roles.
func dropUnanswered(h []Turn) []Turn {
	out := make([]Turn, 0, len(h))
	for i, t := range h {
		if t.Role == "user" && i+1 < len(h) && h[i+1].Role == "user" {
			continue
		}
		out = append(out, t)
	}
	return out
}

// title is the first line of the question, cut to titleMaxRunes.
func title(q string) string {
	q = strings.TrimSpace(q)
	if i := strings.IndexByte(q, '\n'); i >= 0 {
		q = strings.TrimSpace(q[:i])
	}
	if utf8.RuneCountInString(q) > titleMaxRunes {
		r := []rune(q)
		q = strings.TrimSpace(string(r[:titleMaxRunes-1])) + "…"
	}
	if q == "" {
		q = "New conversation"
	}
	return q
}
