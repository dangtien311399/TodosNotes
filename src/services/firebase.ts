import { readFile } from "node:fs/promises";
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../config/env.js";

const INVALID_FCM_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export type PushMessage = {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
};

let firebaseAppPromise: Promise<App | null> | null = null;

const getFirebaseApp = async (): Promise<App | null> => {
  if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) return null;
  if (getApps().length > 0) return getApp();

  firebaseAppPromise ??= (async () => {
    const raw = await readFile(env.FIREBASE_SERVICE_ACCOUNT_PATH!, "utf8");
    const serviceAccount = JSON.parse(raw) as ServiceAccount;
    return initializeApp({
      credential: cert(serviceAccount),
    });
  })();

  return firebaseAppPromise;
};

const chunksOf = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const sendFirebasePushToTokens = async (
  message: PushMessage
): Promise<PushResult> => {
  const tokens = [...new Set(message.tokens)].filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const app = await getFirebaseApp();
  if (!app) {
    return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
  }

  const messaging = getMessaging(app);
  const invalidTokens: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const chunk of chunksOf(tokens, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: message.data,
    });

    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((sendResponse, index) => {
      const code = sendResponse.error?.code;
      if (code && INVALID_FCM_TOKEN_CODES.has(code)) {
        invalidTokens.push(chunk[index]);
      }
    });
  }

  return {
    successCount,
    failureCount,
    invalidTokens: [...new Set(invalidTokens)],
  };
};
