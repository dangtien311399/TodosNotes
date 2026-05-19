export const nowISO = (): string => new Date().toISOString();

export const todayDate = (): string => new Date().toISOString().slice(0, 10);

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
