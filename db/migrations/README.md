# Migrations

Goose format (`-- +goose Up` / `-- +goose Down`). These files are also sqlc's schema source.

Version ranges are reserved per workstream so parallel branches don't collide:

| Range        | Owner                                              |
|--------------|----------------------------------------------------|
| 00001–00009  | Foundation (auth, orgs, integrations table)        |
| 00010–00019  | Provider integrations (OAuth, sync state)          |
| 00020–00029  | Canonical entities, metric facts, analytics        |
| 00030+       | Unassigned: dayparting, automation, actions         |

Apply with `make migrate`. Out-of-order application is enabled for this reason.
