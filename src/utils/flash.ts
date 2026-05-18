import type { FastifyReply, FastifyRequest } from "fastify";

export type FlashType = "info" | "success" | "warning" | "error";
export type Flash = { type: FlashType; message: string };

const COOKIE = "admin_flash";

export const setFlash = (reply: FastifyReply, type: FlashType, message: string): void => {
  reply.setCookie(COOKIE, JSON.stringify({ type, message }), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60,
  });
};

export const consumeFlash = (req: FastifyRequest, reply: FastifyReply): Flash | null => {
  const raw = req.cookies[COOKIE];
  if (!raw) return null;
  reply.clearCookie(COOKIE, { path: "/" });
  try {
    const parsed = JSON.parse(raw) as Flash;
    if (parsed && parsed.type && parsed.message) return parsed;
  } catch {
    /* ignore */
  }
  return null;
};
