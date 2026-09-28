package recommendations

import (
	"context"

	"github.com/hibiken/asynq"
)

// TaskGenerate regenerates every organization's recommendations.
const TaskGenerate = "recommendations:generate"

// GenerateSpec is the asynq scheduler spec for TaskGenerate.
const GenerateSpec = "@hourly"

// Worker runs the generator task.
type Worker struct{ svc *Service }

func NewWorker(svc *Service) *Worker { return &Worker{svc: svc} }

func (w *Worker) Register(mux *asynq.ServeMux) {
	mux.HandleFunc(TaskGenerate, func(ctx context.Context, _ *asynq.Task) error {
		return w.svc.GenerateAll(ctx)
	})
}
