# Migrations

Goose format (`-- +goose Up` / `-- +goose Down`). These files are also sqlc's schema source.

Version ranges are reserved per workstream so parallel branches don't collide:

| Range        | Owner                                              |
|--------------|----------------------------------------------------|
| 00001–00009  | Foundation (auth, orgs, integrations table)        |
| 00010–00019  | Provider integrations (OAuth, sync state)          |
| 00020–00029  | Canonical entities, metric facts, analytics        |
| 00030–00039  | Unassigned                                         |
| 00040–00049  | Dayparting, automation rules, actions log          |
| 00050–00059  | Unassigned                                         |
| 00060–00069  | Alerts and email                                   |
| 00070–00079  | AI analyst (00070); changelog (00071)              |
| 00080–00089  | Unassigned                                         |
| 00090–00099  | Platform admin console                             |

Apply with `make migrate`. Out-of-order application is enabled for this reason.
