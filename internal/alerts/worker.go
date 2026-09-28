package alerts

import (
	"context"
	"time"

	"github.com/hibiken/asynq"
)

// TaskRun runs every detector for every organization.
const TaskRun = "alerts:run"

// RunSpec is the scheduler spec for TaskRun: hourly, at :20 so the top-of-hour
// integration sync has usually landed.
const RunSpec = "20 * * * *"

// NewRunTask is the scheduled task (register on queue.QueueNotifications).
func NewRunTask() *asynq.Task {
	return asynq.NewTask(TaskRun, nil, asynq.MaxRetry(2), asynq.Timeout(10*time.Minute))
}

// Register adds the TaskRun handler.
func (s *Service) Register(mux *asynq.ServeMux) {
	mux.HandleFunc(TaskRun, func(ctx context.Context, _ *asynq.Task) error { return s.RunAll(ctx) })
}
