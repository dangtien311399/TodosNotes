export const nowISO = (): string => new Date().toISOString();

export const todayDate = (): string => new Date().toISOString().slice(0, 10);

export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type LocalNowParts = {
  date: string;
  hhmm: string;
  hour: number;
  minute: number;
  timezone: string;
};

const localPartsFormatter = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatLocalNowParts = (timeZone: string, now: Date): LocalNowParts => {
  const formatter = localPartsFormatter(timeZone);
  const parts = new Map(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const year = parts.get("year") ?? "1970";
  const month = parts.get("month") ?? "01";
  const day = parts.get("day") ?? "01";
  const hour = Number(parts.get("hour") ?? 0);
  const minute = Number(parts.get("minute") ?? 0);
  return {
    date: `${year}-${month}-${day}`,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
    timezone: timeZone,
  };
};

export const getLocalNowParts = (
  timeZone: string | null | undefined,
  now: Date = new Date()
): LocalNowParts => {
  try {
    return formatLocalNowParts(timeZone || DEFAULT_TIME_ZONE, now);
  } catch {
    return formatLocalNowParts(DEFAULT_TIME_ZONE, now);
  }
};

// Date math UTC. Input/output dạng "YYYY-MM-DD".
export const addDays = (d: string, n: number): string => {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

export const dayDiff = (a: string, b: string): number => {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((tb - ta) / 86_400_000);
};

export const daysInRange = (from: string, to: string): string[] => {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
};

export const isoWeekday = (date: string): number => {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return day === 0 ? 7 : day;
};

export const startOfIsoWeek = (date: string): string =>
  addDays(date, 1 - isoWeekday(date));
