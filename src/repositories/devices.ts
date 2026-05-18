import { turso } from "../config/db.js";

export type DeviceRow = {
  id: string;
  user_id: string;
  device_name: string | null;
  platform: "android" | "ios" | "windows";
  push_token: string | null;
  last_sync_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};

const mapRow = (row: Record<string, unknown>): DeviceRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  device_name: (row.device_name as string | null) ?? null,
  platform: row.platform as DeviceRow["platform"],
  push_token: (row.push_token as string | null) ?? null,
  last_sync_at: (row.last_sync_at as string | null) ?? null,
  last_seen_at: (row.last_seen_at as string | null) ?? null,
  created_at: row.created_at as string,
});

export const listDevicesByUser = async (userId: string): Promise<DeviceRow[]> => {
  const res = await turso.execute({
    sql: "SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC NULLS LAST, created_at DESC",
    args: [userId],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapRow);
};

export const getDeviceById = async (id: string): Promise<DeviceRow | null> => {
  const res = await turso.execute({
    sql: "SELECT * FROM devices WHERE id = ?",
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as unknown as Record<string, unknown>);
};

export const revokeDevicePushToken = async (id: string): Promise<void> => {
  await turso.execute({
    sql: "UPDATE devices SET push_token = NULL WHERE id = ?",
    args: [id],
  });
};
