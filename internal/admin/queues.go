package admin

import (
	"cmp"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/queue"
)

var (
	errUnknownQueue = httpx.NewError(http.StatusNotFound, "unknown_queue", "unknown queue")
	errBadState     = httpx.NewError(http.StatusUnprocessableEntity, "invalid_state",
		"state must be one of active, pending, scheduled, retry, archived, completed")
)

// knownQueue reports whether name is one of the queues the worker serves.
// Unknown names are rejected so the console cannot poke arbitrary Redis keys.
func knownQueue(name string) bool {
	_, ok := queue.Weights[name]
	return ok
}

type QueueView struct {
	Name      string  `json:"name"`
	Paused    bool    `json:"paused"`
	Size      int     `json:"size"`
	Pending   int     `json:"pending"`
	Active    int     `json:"active"`
	Scheduled int     `json:"scheduled"`
	Retry     int     `json:"retry"`
	Archived  int     `json:"archived"`
	Completed int     `json:"completed"`
	Processed int     `json:"processed_today"`
	Failed    int     `json:"failed_today"`
	LatencyMS int64   `json:"latency_ms"`
	MemoryKB  float64 `json:"memory_kb"`
	Priority  int     `json:"priority"`
}

type WorkerTask struct {
	TaskID   string          `json:"task_id"`
	Type     string          `json:"type"`
	Queue    string          `json:"queue"`
	Payload  json.RawMessage `json:"payload"`
	Started  time.Time       `json:"started"`
	Deadline time.Time       `json:"deadline"`
}

type ServerView struct {
	ID          string       `json:"id"`
	Host        string       `json:"host"`
	PID         int          `json:"pid"`
	Concurrency int          `json:"concurrency"`
	Status      string       `json:"status"`
	Started     time.Time    `json:"started"`
	Active      []WorkerTask `json:"active"`
}

type ScheduleView struct {
	ID   string     `json:"id"`
	Spec string     `json:"spec"`
	Type string     `json:"type"`
	Next time.Time  `json:"next"`
	Prev *time.Time `json:"prev"`
}

type DayStats struct {
	Date      string `json:"date"`
	Processed int    `json:"processed"`
	Failed    int    `json:"failed"`
}

type QueuesOverview struct {
	Queues    []QueueView    `json:"queues"`
	Servers   []ServerView   `json:"servers"`
	Schedules []ScheduleView `json:"schedules"`
	// History sums every queue per day, oldest first.
	History []DayStats `json:"history"`
}

type TaskView struct {
	ID               string          `json:"id"`
	Queue            string          `json:"queue"`
	Type             string          `json:"type"`
	State            string          `json:"state"`
	Payload          json.RawMessage `json:"payload"`
	OrganizationID   *uuid.UUID      `json:"organization_id,omitempty"`
	OrganizationName string          `json:"organization_name,omitempty"`
	Retried          int             `json:"retried"`
	MaxRetry         int             `json:"max_retry"`
	LastError        string          `json:"last_error,omitempty"`
	LastFailedAt     *time.Time      `json:"last_failed_at,omitempty"`
	NextProcessAt    *time.Time      `json:"next_process_at,omitempty"`
	CompletedAt      *time.Time      `json:"completed_at,omitempty"`
	TimeoutSeconds   float64         `json:"timeout_seconds"`
}

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

// rawJSON passes JSON payloads through and wraps anything else as a string.
func rawJSON(b []byte) json.RawMessage {
	if len(b) == 0 {
		return json.RawMessage("null")
	}
	if json.Valid(b) {
		return b
	}
	s, _ := json.Marshal(string(b))
	return s
}

func toTaskView(t *asynq.TaskInfo) TaskView {
	v := TaskView{
		ID: t.ID, Queue: t.Queue, Type: t.Type, State: t.State.String(), Payload: rawJSON(t.Payload),
		Retried: t.Retried, MaxRetry: t.MaxRetry, LastError: t.LastErr,
		LastFailedAt: timePtr(t.LastFailedAt), NextProcessAt: timePtr(t.NextProcessAt),
		CompletedAt: timePtr(t.CompletedAt), TimeoutSeconds: t.Timeout.Seconds(),
	}
	var p struct {
		OrganizationID *uuid.UUID `json:"organization_id"`
	}
	if json.Unmarshal(t.Payload, &p) == nil {
		v.OrganizationID = p.OrganizationID
	}
	return v
}

func (h *Handlers) queuesOverview(w http.ResponseWriter, r *http.Request) error {
	out := QueuesOverview{Queues: []QueueView{}, Servers: []ServerView{}, Schedules: []ScheduleView{}, History: []DayStats{}}
	byDay := map[string]*DayStats{}
	for name, prio := range queue.Weights {
		info, err := h.inspector.GetQueueInfo(name)
		if err != nil {
			// A queue that has never received a task does not exist in Redis yet.
			out.Queues = append(out.Queues, QueueView{Name: name, Priority: prio})
			continue
		}
		out.Queues = append(out.Queues, QueueView{
			Name: name, Paused: info.Paused, Size: info.Size, Pending: info.Pending, Active: info.Active,
			Scheduled: info.Scheduled, Retry: info.Retry, Archived: info.Archived, Completed: info.Completed,
			Processed: info.Processed, Failed: info.Failed, LatencyMS: info.Latency.Milliseconds(),
			MemoryKB: float64(info.MemoryUsage) / 1024, Priority: prio,
		})
		hist, err := h.inspector.History(name, 7)
		if err != nil {
			continue
		}
		for _, d := range hist {
			key := d.Date.Format(time.DateOnly)
			if byDay[key] == nil {
				byDay[key] = &DayStats{Date: key}
			}
			byDay[key].Processed += d.Processed
			byDay[key].Failed += d.Failed
		}
	}
	slices.SortFunc(out.Queues, func(a, b QueueView) int { return cmp.Or(b.Priority-a.Priority, cmp.Compare(a.Name, b.Name)) })
	for _, d := range byDay {
		out.History = append(out.History, *d)
	}
	slices.SortFunc(out.History, func(a, b DayStats) int { return cmp.Compare(a.Date, b.Date) })

	if servers, err := h.inspector.Servers(); err == nil {
		for _, s := range servers {
			sv := ServerView{ID: s.ID, Host: s.Host, PID: s.PID, Concurrency: s.Concurrency, Status: s.Status, Started: s.Started, Active: []WorkerTask{}}
			for _, wk := range s.ActiveWorkers {
				sv.Active = append(sv.Active, WorkerTask{TaskID: wk.TaskID, Type: wk.TaskType, Queue: wk.Queue,
					Payload: rawJSON(wk.TaskPayload), Started: wk.Started, Deadline: wk.Deadline})
			}
			out.Servers = append(out.Servers, sv)
		}
	}
	if entries, err := h.inspector.SchedulerEntries(); err == nil {
		for _, e := range entries {
			out.Schedules = append(out.Schedules, ScheduleView{ID: e.ID, Spec: e.Spec, Type: e.Task.Type(), Next: e.Next, Prev: timePtr(e.Prev)})
		}
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) listTasks(queueName, state string, page, size int) ([]*asynq.TaskInfo, error) {
	opts := []asynq.ListOption{asynq.Page(page), asynq.PageSize(size)}
	switch state {
	case "active":
		return h.inspector.ListActiveTasks(queueName, opts...)
	case "pending":
		return h.inspector.ListPendingTasks(queueName, opts...)
	case "scheduled":
		return h.inspector.ListScheduledTasks(queueName, opts...)
	case "retry":
		return h.inspector.ListRetryTasks(queueName, opts...)
	case "archived":
		return h.inspector.ListArchivedTasks(queueName, opts...)
	case "completed":
		return h.inspector.ListCompletedTasks(queueName, opts...)
	}
	return nil, errBadState
}

// labelOrgs fills OrganizationName from the task payloads' organization IDs.
func (h *Handlers) labelOrgs(r *http.Request, tasks []TaskView) {
	var ids []uuid.UUID
	for _, t := range tasks {
		if t.OrganizationID != nil && !slices.Contains(ids, *t.OrganizationID) {
			ids = append(ids, *t.OrganizationID)
		}
	}
	names, err := h.store.OrgNames(r.Context(), ids)
	if err != nil {
		return
	}
	for i := range tasks {
		if tasks[i].OrganizationID != nil {
			tasks[i].OrganizationName = names[*tasks[i].OrganizationID]
		}
	}
}

func (h *Handlers) queueTasks(w http.ResponseWriter, r *http.Request) error {
	name := urlParam(r, "queue")
	if !knownQueue(name) {
		return errUnknownQueue
	}
	page := max(queryInt(r, "page", 1), 1)
	infos, err := h.listTasks(name, r.URL.Query().Get("state"), page, 50)
	if err != nil && !errors.Is(err, asynq.ErrQueueNotFound) {
		return err
	}
	tasks := make([]TaskView, 0, len(infos))
	for _, t := range infos {
		tasks = append(tasks, toTaskView(t))
	}
	h.labelOrgs(r, tasks)
	httpx.JSON(w, http.StatusOK, map[string]any{"tasks": tasks, "page": page})
	return nil
}

// failures lists retrying and archived (dead) tasks across every queue,
// most recent failure first.
func (h *Handlers) failures(w http.ResponseWriter, r *http.Request) error {
	tasks := []TaskView{}
	for name := range queue.Weights {
		for _, state := range []string{"retry", "archived"} {
			infos, err := h.listTasks(name, state, 1, 50)
			if err != nil {
				continue
			}
			for _, t := range infos {
				tasks = append(tasks, toTaskView(t))
			}
		}
	}
	slices.SortFunc(tasks, func(a, b TaskView) int {
		var at, bt time.Time
		if a.LastFailedAt != nil {
			at = *a.LastFailedAt
		}
		if b.LastFailedAt != nil {
			bt = *b.LastFailedAt
		}
		return bt.Compare(at)
	})
	if len(tasks) > 100 {
		tasks = tasks[:100]
	}
	h.labelOrgs(r, tasks)
	httpx.JSON(w, http.StatusOK, map[string]any{"tasks": tasks})
	return nil
}

func (h *Handlers) taskAction(action string) func(w http.ResponseWriter, r *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		name, id := urlParam(r, "queue"), urlParam(r, "taskID")
		if !knownQueue(name) {
			return errUnknownQueue
		}
		var err error
		switch action {
		case "run":
			err = h.inspector.RunTask(name, id)
		case "delete":
			err = h.inspector.DeleteTask(name, id)
		case "archive":
			err = h.inspector.ArchiveTask(name, id)
		}
		if errors.Is(err, asynq.ErrTaskNotFound) || errors.Is(err, asynq.ErrQueueNotFound) {
			return httpx.ErrNotFound
		}
		if err != nil {
			return httpx.NewError(http.StatusConflict, "task_action_failed", err.Error())
		}
		if err := h.record(r, "admin.task_"+action, "task", id, map[string]any{"queue": name}); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
}

func (h *Handlers) queueAction(action string) func(w http.ResponseWriter, r *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		name := urlParam(r, "queue")
		if !knownQueue(name) {
			return errUnknownQueue
		}
		var (
			n   int
			err error
		)
		switch action {
		case "pause":
			err = h.inspector.PauseQueue(name)
		case "resume":
			err = h.inspector.UnpauseQueue(name)
		case "retry_all":
			// Retry-state tasks run now; dead (archived) tasks get another go too.
			if n, err = h.inspector.RunAllRetryTasks(name); err == nil {
				var m int
				m, err = h.inspector.RunAllArchivedTasks(name)
				n += m
			}
		case "clear_archived":
			n, err = h.inspector.DeleteAllArchivedTasks(name)
		}
		if errors.Is(err, asynq.ErrQueueNotFound) {
			return httpx.ErrNotFound
		}
		if err != nil {
			return httpx.NewError(http.StatusConflict, "queue_action_failed", err.Error())
		}
		if err := h.record(r, "admin.queue_"+action, "queue", name, map[string]any{"tasks": n}); err != nil {
			return err
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"tasks": n})
		return nil
	}
}
