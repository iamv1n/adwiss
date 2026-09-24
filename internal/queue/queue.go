// Package queue defines the Redis-backed job queues (asynq) shared by the API and worker.
package queue

import (
	"github.com/hibiken/asynq"
)

// Queue names from the plan (§23). Weights are relative processing priorities.
const (
	QueueActionExecution      = "action_execution"
	QueueDaypartingEvaluation = "dayparting_evaluation"
	QueueAutomationEvaluation = "automation_evaluation"
	QueueAccountSync          = "account_sync"
	QueueCampaignSync         = "campaign_sync"
	QueueMetricSync           = "metric_sync"
	QueueNotifications        = "notifications"
	QueueMaintenance          = "maintenance"
)

// Weights favour latency-sensitive mutations over bulk syncing.
var Weights = map[string]int{
	QueueActionExecution:      10,
	QueueDaypartingEvaluation: 8,
	QueueAutomationEvaluation: 6,
	QueueNotifications:        4,
	QueueAccountSync:          3,
	QueueCampaignSync:         3,
	QueueMetricSync:           2,
	QueueMaintenance:          1,
}

// Task types.
const (
	TaskCleanupSessions = "maintenance:cleanup_sessions"

	// Provider sync (internal/integrations). Integration sync refreshes the
	// account list and fans out one entity sync per sync-enabled account;
	// entity sync (campaigns → ad groups → ads → creatives) then enqueues
	// metric syncs (one per report and date range).
	TaskIntegrationSync    = "integration:sync"
	TaskIntegrationSyncAll = "integration:sync_all"
	TaskEntitySync         = "integration:entity_sync"
	TaskMetricSync         = "integration:metric_sync"
)

// RedisOpt converts a redis:// URL into asynq connection options.
func RedisOpt(url string) (asynq.RedisConnOpt, error) {
	return asynq.ParseRedisURI(url)
}
