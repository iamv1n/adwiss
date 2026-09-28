// Package learn stores each user's progress through the in-app course
// ("Learn"). The course content itself is static in the web app; the server
// only records which lessons a user completed and whether they answered the
// lesson quiz correctly. Milestones are derived from this in the web app.
package learn

import (
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

var lessonID = regexp.MustCompile(`^[a-z0-9-]{1,64}\.[a-z0-9-]{1,64}$`)

// Completion is one completed lesson.
type Completion struct {
	LessonID    string    `json:"lesson_id"`
	CompletedAt time.Time `json:"completed_at"`
	QuizCorrect *bool     `json:"quiz_correct"`
}

type Handlers struct{ pool *pgxpool.Pool }

func NewHandlers(pool *pgxpool.Pool) *Handlers { return &Handlers{pool: pool} }

// Routes mounts under /v1/learn behind RequireUser:
//
//	GET    /progress                 → { "completed": [Completion] }
//	PUT    /progress/{lessonID}      { "quiz_correct": bool|null } → { "completion": Completion }
//	DELETE /progress/{lessonID}      mark not completed → 204
//	DELETE /progress                 reset: forget every completed lesson → 204
func (h *Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/progress", httpx.Handler(h.list))
	r.Put("/progress/{lessonID}", httpx.Handler(h.complete))
	r.Delete("/progress/{lessonID}", httpx.Handler(h.uncomplete))
	r.Delete("/progress", httpx.Handler(h.reset))
	return r
}

func userID(r *http.Request) uuid.UUID { return auth.FromContext(r.Context()).User.ID }

func lessonParam(r *http.Request) (string, error) {
	id := chi.URLParam(r, "lessonID")
	if !lessonID.MatchString(id) {
		e := httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", "invalid lesson id")
		e.Fields = map[string]string{"lesson_id": "invalid lesson id"}
		return "", e
	}
	return id, nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.pool.Query(r.Context(),
		`SELECT lesson_id, completed_at, quiz_correct FROM learning_progress WHERE user_id = $1 ORDER BY completed_at`,
		userID(r))
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Completion, error) {
		var c Completion
		err := row.Scan(&c.LessonID, &c.CompletedAt, &c.QuizCorrect)
		return c, err
	})
	if err != nil {
		return err
	}
	if out == nil {
		out = []Completion{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"completed": out})
	return nil
}

type completeRequest struct {
	QuizCorrect *bool `json:"quiz_correct"`
}

func (h *Handlers) complete(w http.ResponseWriter, r *http.Request) error {
	id, err := lessonParam(r)
	if err != nil {
		return err
	}
	var req completeRequest
	if r.ContentLength != 0 {
		if err := httpx.Decode(r, &req); err != nil {
			return err
		}
	}
	// Completing again keeps the first completion time; a correct quiz answer
	// is never downgraded by a later wrong one.
	var c Completion
	err = h.pool.QueryRow(r.Context(), `
		INSERT INTO learning_progress (user_id, lesson_id, quiz_correct) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, lesson_id) DO UPDATE
		SET quiz_correct = CASE WHEN learning_progress.quiz_correct THEN true
		                        ELSE coalesce(EXCLUDED.quiz_correct, learning_progress.quiz_correct) END
		RETURNING lesson_id, completed_at, quiz_correct`,
		userID(r), id, req.QuizCorrect).Scan(&c.LessonID, &c.CompletedAt, &c.QuizCorrect)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"completion": c})
	return nil
}

func (h *Handlers) uncomplete(w http.ResponseWriter, r *http.Request) error {
	id, err := lessonParam(r)
	if err != nil {
		return err
	}
	if _, err := h.pool.Exec(r.Context(), `DELETE FROM learning_progress WHERE user_id = $1 AND lesson_id = $2`, userID(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) reset(w http.ResponseWriter, r *http.Request) error {
	if _, err := h.pool.Exec(r.Context(), `DELETE FROM learning_progress WHERE user_id = $1`, userID(r)); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
