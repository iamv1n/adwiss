package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/platform/ratelimit"
)

// chatTimeout bounds one answer, tool calls included. The router's 30 s
// request timeout is too short for a multi-step answer, so the handler runs
// on its own deadline.
const chatTimeout = 3 * time.Minute

type Handlers struct {
	svc   *Service
	limit *ratelimit.Limiter
}

func NewHandlers(svc *Service, limit *ratelimit.Limiter) *Handlers {
	return &Handlers{svc: svc, limit: limit}
}

// Register adds the analyst routes. Any member may use them; conversations
// are private to the user who started them.
//
//	GET    /orgs/{orgID}/ai/status
//	GET    /orgs/{orgID}/ai/conversations
//	GET    /orgs/{orgID}/ai/conversations/{conversationID}
//	DELETE /orgs/{orgID}/ai/conversations/{conversationID}
//	POST   /orgs/{orgID}/ai/chat   → text/event-stream of Event
func (h *Handlers) Register(r chi.Router) {
	r.Get("/orgs/{orgID}/ai/status", httpx.Handler(h.status))
	r.Get("/orgs/{orgID}/ai/conversations", httpx.Handler(h.list))
	r.Get("/orgs/{orgID}/ai/conversations/{conversationID}", httpx.Handler(h.get))
	r.Delete("/orgs/{orgID}/ai/conversations/{conversationID}", httpx.Handler(h.delete))
	r.Post("/orgs/{orgID}/ai/chat", httpx.Handler(h.chat))
}

func (h *Handlers) status(w http.ResponseWriter, _ *http.Request) error {
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": h.svc.Enabled()})
	return nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.List(r.Context(), organizations.MembershipFromContext(r.Context()))
	if err != nil {
		return err
	}
	if out == nil {
		out = []Conversation{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"conversations": out})
	return nil
}

func conversationParam(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		return uuid.Nil, ErrConversationNotFound
	}
	return id, nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	id, err := conversationParam(r)
	if err != nil {
		return err
	}
	out, err := h.svc.Get(r.Context(), organizations.MembershipFromContext(r.Context()), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"conversation": out})
	return nil
}

func (h *Handlers) delete(w http.ResponseWriter, r *http.Request) error {
	id, err := conversationParam(r)
	if err != nil {
		return err
	}
	if err := h.svc.Delete(r.Context(), organizations.MembershipFromContext(r.Context()), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) chat(w http.ResponseWriter, r *http.Request) error {
	if !h.svc.Enabled() {
		return ErrDisabled
	}
	m := organizations.MembershipFromContext(r.Context())
	var req struct {
		ConversationID *uuid.UUID `json:"conversation_id"`
		Message        string     `json:"message" validate:"required,max=4000"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if h.limit != nil {
		ok, retry, err := h.limit.Allow(r.Context(), m.UserID.String())
		if err != nil {
			return err
		}
		if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
			return httpx.NewError(http.StatusTooManyRequests, "rate_limited", "too many questions, try again shortly")
		}
	}
	c, err := h.svc.Prepare(r.Context(), m, req.ConversationID, req.Message)
	if err != nil {
		return err
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		return errors.New("streaming unsupported")
	}
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(chatTimeout + 10*time.Second))

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	emit := func(ev Event) {
		b, _ := json.Marshal(ev)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}
	emit(Event{Type: "conversation", Conversation: &c})
	// Detached from the router's timeout; the answer is saved even if the
	// client disconnects.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), chatTimeout)
	defer cancel()
	if err := h.svc.Ask(ctx, m, c, req.Message, emit); err != nil {
		h.svc.logger.ErrorContext(ctx, "ai chat failed", "org_id", m.OrganizationID, "err", err)
		emit(Event{Type: "error", Text: "Something went wrong while answering. Please try again."})
		emit(Event{Type: "done"})
	}
	return nil
}
