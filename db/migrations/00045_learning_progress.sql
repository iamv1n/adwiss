-- +goose Up
-- Learn (internal/learn): which course lessons each user has completed, and
-- which lesson quizzes they answered correctly. Per user, not per
-- organization. lesson_id is "<module>.<lesson>" from the web app's static
-- course content; ids are stable once shipped.
CREATE TABLE learning_progress (
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lesson_id    text NOT NULL CHECK (lesson_id ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
    completed_at timestamptz NOT NULL DEFAULT now(),
    quiz_correct boolean,
    PRIMARY KEY (user_id, lesson_id)
);

-- +goose Down
DROP TABLE learning_progress;
