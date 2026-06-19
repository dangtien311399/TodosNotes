import * as notificationsRepo from "../repositories/notifications.js";
import {
  sendFirebasePushToTokens,
  type PushMessage,
  type PushResult,
} from "./firebase.js";

export class NotificationServiceError extends Error {
  constructor(public code: "not_found" | "bad_input") {
    super(code);
  }
}

export type NotificationSender = (message: PushMessage) => Promise<PushResult>;

let notificationSender: NotificationSender = sendFirebasePushToTokens;

export const setNotificationSenderForTests = (
  sender: NotificationSender | null
): void => {
  notificationSender = sender ?? sendFirebasePushToTokens;
};

export const registerToken = async (
  userId: string,
  token: string
): Promise<notificationsRepo.UserDeviceRow> => {
  if (token.trim().length === 0) {
    throw new NotificationServiceError("bad_input");
  }
  const exists = await notificationsRepo.activeUserExists(userId);
  if (!exists) throw new NotificationServiceError("not_found");
  return notificationsRepo.upsertUserDeviceToken(userId, token.trim());
};

const sendToUser = async (input: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<PushResult & { tokenCount: number }> => {
  const tokens = await notificationsRepo.listDeviceTokensByUser(input.userId);
  if (tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      tokenCount: 0,
    };
  }

  const result = await notificationSender({
    tokens,
    title: input.title,
    body: input.body,
    data: input.data,
  });

  if (result.invalidTokens.length > 0) {
    await notificationsRepo.deleteDeviceTokens(result.invalidTokens);
  }

  return { ...result, tokenCount: tokens.length };
};

const MORNING_PLAN_BODY =
  "Hôm nay là một ngày mới. Hãy dành vài phút lên kế hoạch để bắt đầu thật chủ động nhé!";
const EVENING_DONE_BODY =
  "Tuyệt vời! Bạn đã hoàn thành toàn bộ todos hôm nay. Hãy tận hưởng một buổi tối nhẹ nhàng nhé!";

export const sendMorningNotifications = async (
  date: string
): Promise<{ users: number; sent: number; skipped: number; failed: number }> => {
  const userIds = await notificationsRepo.listActiveUserIds();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const claimed = await notificationsRepo.claimNotificationDelivery({
      userId,
      kind: "morning",
      dedupeKey: `morning:${userId}:${date}`,
    });
    if (!claimed) {
      skipped++;
      continue;
    }

    try {
      const count = await notificationsRepo.countImportantUrgentTodosForDate(
        userId,
        date
      );
      const result = await sendToUser({
        userId,
        title: "Chào buổi sáng!",
        body:
          count > 0
            ? `Bạn có ${count} todos quan trọng & khẩn cấp cần thực hiện ngay. Hãy bắt tay vào việc ngay thôi nào!`
            : MORNING_PLAN_BODY,
        data: { type: "morning", date, count: String(count) },
      });
      if (result.tokenCount > 0) sent++;
    } catch {
      failed++;
    }
  }

  return { users: userIds.length, sent, skipped, failed };
};

export const sendEveningNotifications = async (
  date: string
): Promise<{ users: number; sent: number; skipped: number; failed: number }> => {
  const userIds = await notificationsRepo.listActiveUserIds();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const claimed = await notificationsRepo.claimNotificationDelivery({
      userId,
      kind: "evening",
      dedupeKey: `evening:${userId}:${date}`,
    });
    if (!claimed) {
      skipped++;
      continue;
    }

    try {
      const count = await notificationsRepo.countRemainingTodosForDate(
        userId,
        date
      );
      const result = await sendToUser({
        userId,
        title: "Tổng kết ngày",
        body:
          count > 0
            ? `Bạn hiện còn ${count} todos cần hoàn thiện để có 1 ngày trọn vẹn và năng suất!`
            : EVENING_DONE_BODY,
        data: { type: "evening", date, count: String(count) },
      });
      if (result.tokenCount > 0) sent++;
    } catch {
      failed++;
    }
  }

  return { users: userIds.length, sent, skipped, failed };
};

export const sendTodoReminderNotifications = async (
  date: string,
  hhmm: string
): Promise<{ todos: number; sent: number; skipped: number; failed: number }> => {
  const dueTodos = await notificationsRepo.listDueTodoReminders(date, hhmm);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const todo of dueTodos) {
    const claimed = await notificationsRepo.claimNotificationDelivery({
      userId: todo.user_id,
      todoId: todo.id,
      kind: "todo_reminder",
      dedupeKey: `todo_reminder:${todo.id}:${date}:${hhmm}`,
    });
    if (!claimed) {
      skipped++;
      continue;
    }

    try {
      const result = await sendToUser({
        userId: todo.user_id,
        title: "Nhắc nhở todo",
        body: `Đã đến giờ: ${todo.title}`,
        data: {
          type: "todo_reminder",
          todo_id: todo.id,
          scheduled_date: todo.scheduled_date,
          time: todo.time,
        },
      });
      if (result.tokenCount > 0) sent++;
    } catch {
      failed++;
    }
  }

  return { todos: dueTodos.length, sent, skipped, failed };
};
