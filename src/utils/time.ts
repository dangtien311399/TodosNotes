export const nowISO = (): string => new Date().toISOString();

export const todayDate = (): string => new Date().toISOString().slice(0, 10);
