package mailer

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
)

// TaskSend delivers one Message from the worker.
const TaskSend = "mail:send"

// Queue is the asynq queue for email (queue.QueueNotifications).
const Queue = "notifications"

// Enqueuer submits tasks. *asynq.Client satisfies it.
type Enqueuer interface {
	EnqueueContext(ctx context.Context, task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error)
}

// Enqueue validates m and queues it for the worker, which retries transient
// failures with backoff (up to ~a day). Extra opts (e.g. asynq.TaskID for
// idempotency, asynq.ProcessIn) are appended.
func Enqueue(ctx context.Context, enq Enqueuer, m Message, opts ...asynq.Option) error {
	if err := m.Validate(); err != nil {
		return err
	}
	payload, err := json.Marshal(m)
	if err != nil {
		return err
	}
	opts = append([]asynq.Option{
		asynq.Queue(Queue), asynq.MaxRetry(10), asynq.Timeout(2 * time.Minute), asynq.Retention(24 * time.Hour),
	}, opts...)
	if _, err := enq.EnqueueContext(ctx, asynq.NewTask(TaskSend, payload), opts...); err != nil {
		return fmt.Errorf("enqueue email: %w", err)
	}
	return nil
}

// Handler returns the asynq handler for TaskSend. Permanent failures (bad
// message, 5xx replies) are not retried.
func Handler(m Mailer) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var msg Message
		if err := json.Unmarshal(t.Payload(), &msg); err != nil {
			return fmt.Errorf("decode email: %v: %w", err, asynq.SkipRetry)
		}
		if err := m.Send(ctx, msg); err != nil {
			if IsPermanent(err) {
				return fmt.Errorf("%v: %w", err, asynq.SkipRetry)
			}
			return err
		}
		return nil
	}
}

// Register adds the TaskSend handler to mux.
func Register(mux *asynq.ServeMux, m Mailer) { mux.Handle(TaskSend, Handler(m)) }
