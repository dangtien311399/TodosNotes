export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad2 = (value: number): string => value.toString().padStart(2, "0");

export type VietnamNowParts = {
  date: string;
  hhmm: string;
  hour: number;
  minute: number;
};

export const getVietnamNowParts = (now: Date = new Date()): VietnamNowParts => {
  const vietnam = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
  const year = vietnam.getUTCFullYear();
  const month = pad2(vietnam.getUTCMonth() + 1);
  const day = pad2(vietnam.getUTCDate());
  const hour = vietnam.getUTCHours();
  const minute = vietnam.getUTCMinutes();

  return {
    date: `${year}-${month}-${day}`,
    hhmm: `${pad2(hour)}:${pad2(minute)}`,
    hour,
    minute,
  };
};

export const vietnamDateFromISO = (iso: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return getVietnamNowParts(date).date;
};
