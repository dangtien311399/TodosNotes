import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "";

const { turso } = await import("../src/config/db.js");
const { CreateNoteSchema, UpdateNoteSchema } = await import(
  "../src/schemas/api/notes.js"
);
const notesService = await import("../src/services/notes.js");
const syncService = await import("../src/services/sync.service.js");
const syncRepo = await import("../src/repositories/sync.repo.js");

const USER_ID = "user-note-rich-text";
const CREATED_AT = "2026-06-24T08:00:00.000Z";
const UPDATED_AT = "2026-06-24T09:00:00.000Z";

const notesDelta = {
  ops: [
    { insert: "Important", attributes: { bold: true } },
    { insert: " concept", attributes: { italic: true } },
    { insert: "\n", attributes: { list: "bullet" } },
  ],
};

const cueDelta = {
  ops: [
    { insert: "Key question", attributes: { underline: true } },
    { insert: "\n" },
  ],
};

const summaryDelta = {
  ops: [
    { insert: "Concise summary", attributes: { italic: true } },
    { insert: "\n" },
  ],
};

const getRawNote = async (
  id: string
): Promise<Record<string, unknown>> => {
  const result = await turso.execute({
    sql: "SELECT * FROM notes WHERE id = ?",
    args: [id],
  });
  assert.equal(result.rows.length, 1);
  return result.rows[0] as unknown as Record<string, unknown>;
};

before(async () => {
  await turso.execute(`
    CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'free',
      body TEXT,
      body_delta TEXT,
      cornell_cue TEXT,
      cornell_cue_delta TEXT,
      cornell_summary TEXT,
      cornell_summary_delta TEXT,
      content_format TEXT NOT NULL DEFAULT 'plain',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id)
    )
  `);
  await turso.execute(`
    CREATE TABLE note_links (
      id TEXT PRIMARY KEY,
      source_note_id TEXT NOT NULL,
      target_note_id TEXT NOT NULL,
      label TEXT,
      created_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE todos (
      id TEXT PRIMARY KEY,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE note_todo_links (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      todo_id TEXT NOT NULL,
      created_at TEXT
    )
  `);
  await turso.execute(`
    CREATE VIRTUAL TABLE notes_fts USING fts5(
      note_id UNINDEXED,
      title,
      body,
      cornell_cue,
      cornell_summary
    )
  `);
  await turso.execute(`
    CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(note_id, title, body, cornell_cue, cornell_summary)
      VALUES (
        new.id,
        new.title,
        coalesce(new.body, ''),
        coalesce(new.cornell_cue, ''),
        coalesce(new.cornell_summary, '')
      );
    END
  `);
  await turso.execute(`
    CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
      DELETE FROM notes_fts WHERE note_id = old.id;
      INSERT INTO notes_fts(note_id, title, body, cornell_cue, cornell_summary)
      VALUES (
        new.id,
        new.title,
        coalesce(new.body, ''),
        coalesce(new.cornell_cue, ''),
        coalesce(new.cornell_summary, '')
      );
    END
  `);
  await turso.execute(`
    CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
      DELETE FROM notes_fts WHERE note_id = old.id;
    END
  `);
});

beforeEach(async () => {
  await turso.execute("DELETE FROM note_todo_links");
  await turso.execute("DELETE FROM note_links");
  await turso.execute("DELETE FROM note_tags");
  await turso.execute("DELETE FROM notes");
});

test("free note stores Quill Delta and derives searchable plain text", async () => {
  const parsed = CreateNoteSchema.safeParse({
    title: "Rich note",
    type: "free",
    body: "stale client text",
    body_delta: notesDelta,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const { note } = await notesService.createNote(USER_ID, parsed.data);

  assert.equal(note.body, "Important concept");
  assert.deepEqual(note.body_delta, notesDelta);
  assert.equal(note.content_format, "quill_delta_v1");

  const raw = await getRawNote(note.id);
  assert.equal(raw.body, "Important concept");
  assert.equal(raw.body_delta, JSON.stringify(notesDelta));
});

test("Cornell note keeps independent Notes, Cues and Summary Delta documents", async () => {
  const parsed = CreateNoteSchema.safeParse({
    title: "Cornell lesson",
    type: "cornell",
    body_delta: notesDelta,
    cornell_cue_delta: cueDelta,
    cornell_summary_delta: summaryDelta,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const { note } = await notesService.createNote(USER_ID, parsed.data);

  assert.equal(note.title, "Cornell lesson");
  assert.equal(note.body, "Important concept");
  assert.equal(note.cornell_cue, "Key question");
  assert.equal(note.cornell_summary, "Concise summary");
  assert.deepEqual(note.body_delta, notesDelta);
  assert.deepEqual(note.cornell_cue_delta, cueDelta);
  assert.deepEqual(note.cornell_summary_delta, summaryDelta);
});

test("formatted Delta content remains searchable through the plain-text FTS mirror", async () => {
  const input = CreateNoteSchema.parse({
    title: "Searchable rich note",
    type: "free",
    body_delta: notesDelta,
  });
  const { note } = await notesService.createNote(USER_ID, input);

  const result = await notesService.listNotes(USER_ID, {
    limit: 20,
    q: "Important",
  });

  assert.deepEqual(
    result.rows.map((row) => row.id),
    [note.id]
  );
  assert.deepEqual(result.rows[0].body_delta, notesDelta);
});

test("partial Cornell edits preserve untouched formatting and plain edits invalidate only their Delta", async () => {
  const created = CreateNoteSchema.parse({
    title: "Editable Cornell",
    type: "cornell",
    body_delta: notesDelta,
    cornell_cue_delta: cueDelta,
    cornell_summary_delta: summaryDelta,
  });
  const { note } = await notesService.createNote(USER_ID, created);
  const replacementDelta = {
    ops: [
      { insert: "Revised notes", attributes: { underline: true } },
      { insert: "\n" },
    ],
  };

  const richPatch = UpdateNoteSchema.parse({
    body_delta: replacementDelta,
  });
  const afterRichEdit = await notesService.updateNote(
    USER_ID,
    note.id,
    richPatch
  );
  assert.equal(afterRichEdit.body, "Revised notes");
  assert.deepEqual(afterRichEdit.body_delta, replacementDelta);
  assert.deepEqual(afterRichEdit.cornell_cue_delta, cueDelta);
  assert.deepEqual(afterRichEdit.cornell_summary_delta, summaryDelta);

  const plainPatch = UpdateNoteSchema.parse({
    cornell_cue: "Plain cue edited by an older client",
  });
  const afterPlainEdit = await notesService.updateNote(
    USER_ID,
    note.id,
    plainPatch
  );
  assert.equal(afterPlainEdit.cornell_cue, "Plain cue edited by an older client");
  assert.equal(afterPlainEdit.cornell_cue_delta, null);
  assert.deepEqual(afterPlainEdit.body_delta, replacementDelta);
  assert.deepEqual(afterPlainEdit.cornell_summary_delta, summaryDelta);
  assert.equal(afterPlainEdit.content_format, "quill_delta_v1");
});

test("Cornell validation rejects missing areas and invalid Quill operations", async () => {
  assert.equal(
    CreateNoteSchema.safeParse({
      title: "Incomplete Cornell",
      type: "cornell",
      body_delta: notesDelta,
      cornell_cue_delta: cueDelta,
    }).success,
    false
  );

  assert.equal(
    CreateNoteSchema.safeParse({
      title: "Invalid Delta",
      type: "free",
      body_delta: { ops: [{ retain: 5 }] },
    }).success,
    false
  );
});

test("sync push and conflict payload round-trip Delta as JSON objects", async () => {
  const createResult = await syncService.processPush(USER_ID, [
    {
      op: "create",
      type: "note",
      payload: {
        id: "sync-rich-note",
        title: "Synced Cornell",
        type: "cornell",
        body: "wrong plain text",
        body_delta: notesDelta,
        cornell_cue_delta: cueDelta,
        cornell_summary_delta: summaryDelta,
        is_pinned: false,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
    },
  ]);
  assert.deepEqual(createResult, [
    { id: "sync-rich-note", status: "applied" },
  ]);

  const rawCreated = await getRawNote("sync-rich-note");
  assert.equal(rawCreated.body, "Important concept");
  assert.equal(rawCreated.body_delta, JSON.stringify(notesDelta));

  const replacementDelta = {
    ops: [
      { insert: "Synced revision", attributes: { bold: true } },
      { insert: "\n" },
    ],
  };
  const updateResult = await syncService.processPush(USER_ID, [
    {
      op: "update",
      type: "note",
      payload: {
        id: "sync-rich-note",
        body_delta: replacementDelta,
        updated_at: UPDATED_AT,
      },
    },
  ]);
  assert.deepEqual(updateResult, [
    { id: "sync-rich-note", status: "applied" },
  ]);

  const rawUpdated = await getRawNote("sync-rich-note");
  assert.equal(rawUpdated.title, "Synced Cornell");
  assert.equal(rawUpdated.body, "Synced revision");
  assert.equal(rawUpdated.body_delta, JSON.stringify(replacementDelta));
  assert.equal(rawUpdated.cornell_cue_delta, JSON.stringify(cueDelta));

  const payload = await syncRepo.getFullEntity(
    "note",
    "sync-rich-note",
    USER_ID
  );
  assert.ok(payload);
  assert.deepEqual(payload.body_delta, replacementDelta);
  assert.deepEqual(payload.cornell_cue_delta, cueDelta);
  assert.deepEqual(payload.cornell_summary_delta, summaryDelta);
  assert.equal(payload.content_format, "quill_delta_v1");
});

test("sync rejects malformed Delta without changing the note", async () => {
  await syncService.processPush(USER_ID, [
    {
      op: "create",
      type: "note",
      payload: {
        id: "sync-invalid-delta",
        title: "Valid first",
        type: "free",
        body_delta: notesDelta,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
    },
  ]);

  const result = await syncService.processPush(USER_ID, [
    {
      op: "update",
      type: "note",
      payload: {
        id: "sync-invalid-delta",
        body_delta: { ops: [{ delete: 2 }] },
        updated_at: UPDATED_AT,
      },
    },
  ]);

  assert.deepEqual(result, [
    { id: "sync-invalid-delta", status: "error", error: "bad_input" },
  ]);
  const raw = await getRawNote("sync-invalid-delta");
  assert.equal(raw.body_delta, JSON.stringify(notesDelta));
});
