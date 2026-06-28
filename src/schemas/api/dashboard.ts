import { z } from "zod";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const TodayQuerySchema = z.object({
  date: IsoDate.optional(),
});
export type TodayQueryInput = z.infer<typeof TodayQuerySchema>;

export const EisenhowerQuerySchema = TodayQuerySchema;
export type EisenhowerQueryInput = z.infer<typeof EisenhowerQuerySchema>;

export const CalendarOverviewQuerySchema = z
  .object({ from: IsoDate, to: IsoDate })
  .refine(
    (d) => {
      const a = new Date(d.from + "T00:00:00Z").getTime();
      const b = new Date(d.to + "T00:00:00Z").getTime();
      return a <= b && (b - a) / 86_400_000 <= 60;
    },
    "range invalid or > 60 days"
  );
export type CalendarOverviewQueryInput = z.infer<typeof CalendarOverviewQuerySchema>;

export const CalendarDayDetailQuerySchema = z.object({
  date: IsoDate,
});
export type CalendarDayDetailQueryInput = z.infer<
  typeof CalendarDayDetailQuerySchema
>;
