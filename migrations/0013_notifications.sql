CREATE TABLE IF NOT EXISTS user_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_user_token
  ON user_devices(user_id, fcm_token);

CREATE INDEX IF NOT EXISTS idx_user_devices_user
  ON user_devices(user_id);

CREATE INDEX IF NOT EXISTS idx_user_devices_token
  ON user_devices(fcm_token);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  todo_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('morning', 'evening', 'todo_reminder')),
  dedupe_key TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_dedupe
  ON notification_deliveries(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_kind
  ON notification_deliveries(user_id, kind, sent_at);
