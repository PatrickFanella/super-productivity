# Cross-device active-session handoff

**Status:** implementation contract

## Scope

The active-session register lets another synchronized client see that task
tracking, a focus session, or a break is in progress and deliberately take over
that session. It does not turn every connected client into a timer writer.

This distinction is load-bearing: only the owning device records task time,
completes focus phases, emits notifications, or logs focus metrics. Followers
render the shared clock as a read-only mirror. Otherwise two open clients would
both add one second of task time for every real second.

## Wire and persistence model

`TimeTrackingState.activeSession?` is an optional versioned register. It is
updated by `[TimeTracking] Sync active session`, a normal persistent operation
with:

- `entityType: TIME_TRACKING`
- `entityId: ACTIVE_SESSION`
- `opType: UPDATE`
- payload `{ activeSession: SharedActiveSession | null }`

The field is optional so every existing snapshot remains valid. The operation
uses an existing entity type and a new action string that older clients ignore,
so it degrades without a schema-version bump. Older clients continue recording
ordinary task time; they simply do not display or control the shared register.

The register contains no task title or other user-authored content. It carries:

- format version and a UUIDv7 session ID;
- owner client ID;
- optional task ID;
- update and expiry timestamps;
- an optional focus snapshot: mode, purpose, duration, elapsed baseline,
  running/paused state, phase start timestamp, cycle, break flags, and paused
  task ID.

Absolute timestamps are display/recovery inputs only. Ownership and conflict
ordering never rely on wall-clock accuracy.

## Ownership and controls

1. Starting task tracking locally creates or takes ownership of the register.
2. Starting or transitioning focus mode updates the owned register.
3. A different client applies the register as a read-only mirror. It may render
   the active task and clock but must not set its local `currentTaskId`, tick task
   time, complete phases, notify, or write metrics.
4. A follower can explicitly take over. Takeover writes the same logical
   session with its own owner client ID and a fresh update timestamp, then starts
   the local task/focus machinery from the shared elapsed baseline.
5. When the previous owner receives another client's takeover or stop, it
   clears its local task/focus machinery without emitting a compensating
   session operation.
6. Pause, stop, complete, skip, and cancel actions performed by the owner update
   or clear the register through one persistent action per resulting shared
   transition.

The UI remains quiet: receiving a session never opens the focus overlay. The
header/task indicators make it discoverable, and opening focus mode shows the
read-only mirror plus an explicit takeover control.

## Concurrent devices

All active-session operations address the single `TIME_TRACKING:ACTIVE_SESSION`
conflict key. Ordinary vector-clock conflict detection therefore identifies two
offline or simultaneous writers.

The existing deterministic LWW plan selects the winner. When the local active
session wins, conflict recovery must emit another **sync-active-session**
operation carrying only the winning register and a merged dominating vector
clock. It must not emit a replacement-mode `TIME_TRACKING` singleton LWW
snapshot: doing that could overwrite unrelated historical project/tag time.

The winner becomes the sole owner once clients converge. A losing local owner
stops its local timer when it applies the winner. No schema bump is used.

## Expiry and recovery

- Every meaningful owner transition refreshes `updatedAt` and `expiresAt`.
- A register expires after 24 hours without an owner transition. This bounds a
  stale running timer after a device is lost, powered off, or permanently
  disconnected.
- Expiry is not decided inside a reducer; reducers must replay deterministically.
  Startup/runtime coordination compares the stored expiry with the local clock
  and emits an ordinary clear operation when appropriate.
- Before expiry, the owning client reconstructs its local task/focus machinery
  after reload. A follower reconstructs only a read-only mirror.
- Missing/deleted task IDs do not invalidate a focus break. For work/task-only
  sessions, the task reference is dropped and the remaining valid focus state
  is retained; an empty session is cleared.
- Paused sessions expire by the same rule. Explicit takeover refreshes expiry.

Clock skew can make a displayed remote elapsed time imperfect. Elapsed values
are clamped to non-negative values and fixed-duration sessions are capped for
display. Vector clocks—not timestamps—still determine causal conflicts.

## Verification contract

- A two-client SuperSync E2E must first fail on the old behavior.
- Client B receives the active-task indicator through WebSocket-triggered
  download without clicking sync.
- Opening focus mode on B shows A's running clock without opening it
  automatically.
- B can take over; A stops accumulating and B becomes the only task-time writer.
- Concurrent takeovers converge and preserve unrelated `project` and `tag`
  time-tracking data.
- Replay, own-client recovery, remote mirror, expiry, missing-task recovery, and
  mixed-version ignored-action behavior have focused tests.
