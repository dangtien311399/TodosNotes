# Mobile Contract: Todo Habit Link

## Backend Summary

- API base: `/api/v1`.
- Todo now has nullable `habit_id`.
- Relationship: one habit can have many todos; one todo can link to at most one habit.
- Backend auto-writes habit logs only when a linked todo is completed.
- Changing, clearing, deleting, moving, or uncompleting a linked todo does not mutate existing habit logs.

## REST Contract

- `POST /todos` accepts optional `habit_id: string | null`.
- `PATCH /todos/:id` accepts optional `habit_id: string | null`.
  - Field absent keeps existing link.
  - `habit_id: null` clears the link.
  - Invalid, foreign, or deleted habit returns `{ "error": "invalid_habit" }`.
- `GET /todos?habit_id=<uuid>` filters todos linked to a habit.
- Todo responses include `habit_id`.
- `POST /todos/:id/complete` returns the existing complete payload and may auto-log the linked habit server-side.
- If completion creates `next_recurring_todo`, the new todo copies `habit_id`.

## Auto Habit Log Rules

- Runs only on todo complete events.
- Log date is `todo.scheduled_date`; no scheduled date means no auto-log.
- A todo is on time when `completed_at` date is less than or equal to `scheduled_date`.
- For all live todos with the same `habit_id` and `scheduled_date`:
  - habit log `completed=true` only if every linked todo is done on time.
  - otherwise habit log `completed=false`.
- Existing habit log `note` is preserved.
- Backend recomputes habit streaks after auto-log.

## Sync Contract

- `/sync/changes` returns `todos[].habit_id`.
- `/sync/push` accepts `habit_id` on todo payloads.
  - Field absent preserves.
  - `habit_id: null` clears.
  - Invalid link returns operation error `invalid_habit`.
- Sync push todo create/update that transitions a linked todo to `done` triggers the same auto-log rules.
- Mobile should still sync/pull `habit_logs` normally; backend-created logs arrive through standard sync changes.

## Verification

- `npm run build` passes.
- `npm test` passes with 41 tests.
- Migration `0011_todo_habit_link.sql` applies successfully.
- `verify-sync-payload` confirms todo sync payload includes `habit_id`.
