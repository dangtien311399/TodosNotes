/**
 * sync.service.ts
 *
 * Business logic for sync push:
 *  - Ownership verification (§5.1)
 *  - LWW (Last-Write-Wins) (§5.2)
 *  - Server-only field stripping (§5.3) via fromSyncEntity
 *  - Junction reconcile (§5.4)
 *  - Tag natural-key conflict (§3.3)
 *  - Habit-log natural-key conflict (§3.5)
 *  - System-template protection (§8 read_only)
 *  - Soft-delete cascade (§6)
 */
import { nowISO } from "../utils/time.js";
import { fromSyncEntity } from "../sync/sync-serializer.js";
import type { SyncOp } from "../schemas/api/sync.js";
import {
  getEntityInfo,
  isSystemTemplate,
  getTagByNaturalKey,
  getHabitLogByNaturalKey,
  resurrectTagRow,
  resurrectHabitLogRow,
  getFullEntity,
  upsertEntity,
  softDeleteEntity,
  reconcileJunctions,
} from "../repositories/sync.repo.js";

// ── Result type ───────────────────────────────────────────────────────────────

export type OpResult = {
  id: string;
  status: "applied" | "conflict" | "error";
  server_version?: Record<string, unknown>;
  error?: string;
};

// ── processPush ───────────────────────────────────────────────────────────────

/**
 * Process a batch of sync operations for one user.
 * Operations are independent — one error does NOT roll back others.
 */
export const processPush = async (
  userId: string,
  ops: SyncOp[]
): Promise<OpResult[]> => {
  const results: OpResult[] = [];
  for (const op of ops) {
    results.push(await processOp(userId, op));
  }
  return results;
};

// ── processOp (per-operation logic) ──────────────────────────────────────────

async function processOp(userId: string, op: SyncOp): Promise<OpResult> {
  const { op: opType, type, payload } = op;

  // id must be present and a string
  const id = payload.id;
  if (!id || typeof id !== "string") {
    return { id: "unknown", status: "error", error: "bad_input" };
  }

  // ── §5.3 Strip server-only fields + convert booleans ─────────────────────
  // fromSyncEntity does NOT strip junction fields (tag_ids, note_links, etc.)
  // so we can pass the original `payload` to reconcileJunctions later.
  const dbPayload = fromSyncEntity(payload, type);

  // ── §8 System-template protection ────────────────────────────────────────
  // system templates are read-only for mobile (create is also blocked
  // because is_system is a server field; but update/delete must be blocked).
  if (type === "checklist_template" && opType !== "create") {
    const sys = await isSystemTemplate(id);
    if (sys) return { id, status: "error", error: "read_only" };
  }

  // ── §5.1 Ownership check ─────────────────────────────────────────────────
  let entityInfo: { user_id: string | null; updated_at: string | null } | null = null;

  if (opType === "create") {
    // Force user_id = jwt.sub — ignore whatever mobile sent
    dbPayload.user_id = userId;
  } else {
    entityInfo = await getEntityInfo(type, id);

    if (entityInfo === null) {
      if (opType === "delete") {
        // Idempotent: entity already gone
        return { id, status: "applied" };
      }
      // update of non-existing → treat as implicit create
      dbPayload.user_id = userId;
    } else {
      if (entityInfo.user_id !== userId) {
        return { id, status: "error", error: "forbidden" };
      }
    }
  }

  // ── §3.3 Tag natural-key conflict ─────────────────────────────────────────
  if (type === "tag" && opType !== "delete") {
    const name = payload.name as string | undefined;
    if (name) {
      const nk = await getTagByNaturalKey(userId, name);
      if (nk && nk.id !== id) {
        // Different server row has same (user_id, name)
        if (nk.deleted_at !== null) {
          // Resurrect the dead row with the pushed data
          await resurrectTagRow(nk.id, {
            name: payload.name,
            color: payload.color,
            updated_at: payload.updated_at,
          });
        }
        // Either way: canonical id is nk.id — tell mobile to remap
        const sv = await getFullEntity("tag", nk.id, userId);
        return { id, status: "conflict", server_version: sv ?? {} };
      }
    }
  }

  // ── §3.5 Habit-log natural-key conflict ───────────────────────────────────
  if (type === "habit_log" && opType !== "delete") {
    const habitId = payload.habit_id as string | undefined;
    const logDate = payload.log_date as string | undefined;
    if (habitId && logDate) {
      const nk = await getHabitLogByNaturalKey(habitId, logDate, userId);
      if (nk && nk.id !== id) {
        if (nk.deleted_at !== null) {
          // Resurrect
          await resurrectHabitLogRow(nk.id, {
            completed: payload.completed,
            note: payload.note,
            updated_at: payload.updated_at,
          });
        }
        const sv = await getFullEntity("habit_log", nk.id, userId);
        return { id, status: "conflict", server_version: sv ?? {} };
      }
    }
  }

  // ── §5.2 LWW ─────────────────────────────────────────────────────────────
  if (entityInfo !== null && entityInfo.updated_at !== null) {
    const serverUA = entityInfo.updated_at;
    const payloadUA = payload.updated_at as string | undefined;

    if (payloadUA) {
      if (payloadUA < serverUA) {
        // Server wins — return current server state
        const sv = await getFullEntity(type, id, userId);
        return { id, status: "conflict", server_version: sv ?? {} };
      }
      if (payloadUA === serverUA) {
        // Exact same timestamp → no-op, but still "applied"
        return { id, status: "applied" };
      }
      // payloadUA > serverUA → client wins → APPLY (fall through)
    }
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  if (opType === "delete") {
    const delAt = (payload.deleted_at as string | undefined) ?? nowISO();
    await softDeleteEntity(type, id, delAt);
  } else {
    await upsertEntity(userId, type, dbPayload, {
      partialUpdate: opType === "update" && entityInfo !== null,
    });

    // §5.4 Junction reconcile (todo / note only)
    // Skip entirely if all junction arrays are empty AND this is a create:
    // a brand-new entity has no existing junctions to remove, so reconciling
    // against empty arrays would be 3 pointless read round-trips.
    if (type === "todo" || type === "note") {
      const hasJunctions =
        (payload.tag_ids as unknown[] | undefined)?.length ||
        (payload.note_links as unknown[] | undefined)?.length ||
        (payload.linked_todo_ids as unknown[] | undefined)?.length;
      if (opType !== "create" || hasJunctions) {
        await reconcileJunctions(type, id, userId, payload);
      }
    }
  }

  return { id, status: "applied" };
}
