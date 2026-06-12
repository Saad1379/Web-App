// src/services/notificationServices.ts
import { prisma } from "@repo/db";
import { Queue } from "bullmq";

// BullMQ queue for processing notifications
let notificationQueue: Queue | null = null;

const getNotificationQueue = () => {
  if (!notificationQueue) {
    const base = process.env.REDIS_URL
      ? { url: process.env.REDIS_URL }
      : {
          host: process.env.REDIS_HOST ?? "127.0.0.1",
          port: Number(process.env.REDIS_PORT ?? 6379),
        };

    // Fail fast and bound reconnection so an unreachable Redis can never
    // indefinitely block a request that enqueues a notification.
    const connection = {
      ...base,
      connectTimeout: 5000,
      retryStrategy: (times: number) => Math.min(times * 500, 5000),
    };

    notificationQueue = new Queue("notifications", { connection });
    // Avoid unhandled 'error' events crashing the process when Redis is down.
    notificationQueue.on("error", (err) => {
      console.error("Notification queue connection error:", err?.message ?? err);
    });
  }
  return notificationQueue;
};

/**
 * Enqueue a job but never wait longer than `timeoutMs`. If Redis is
 * unreachable, BullMQ's offline command queue would otherwise wait forever;
 * this guarantees the caller can fall back to the durable outbox instead.
 */
const enqueueWithTimeout = async (
  jobName: string,
  payload: Record<string, unknown>,
  opts: Record<string, unknown>,
  timeoutMs = 3000
) => {
  const addPromise = getNotificationQueue().add(jobName, payload, opts);
  // Prevent an unhandled rejection if the add settles after we time out.
  addPromise.catch(() => {});
  await Promise.race([
    addPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("notification enqueue timed out")), timeoutMs)
    ),
  ]);
};

/**
 * Types
 */
type RecipientInput = { userId: string; channels?: string[] };
type CreateNotificationInput = {
  templateKey?: string | null;
  title: string;
  body: string;
  data?: any;
  recipients: RecipientInput[];
  createdBy?: string | null;
};

/**
 * getNotifications: paginated notifications for a user
 */
export const getNotifications = async ({
  userId,
  page = 1,
  limit = 20,
}: {
  userId: string;
  page?: number;
  limit?: number;
}) => {
  try {
    const skip = (page - 1) * limit;
    const items = await prisma.notificationRecipient.findMany({
      where: { userId, isArchived: false },
      include: {
        notification: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const total = await prisma.notificationRecipient.count({
      where: { userId, isArchived: false },
    });

    return {
      success: true,
      data: {
        items: items.map((i) => ({
          id: i.id,
          readAt: i.readAt,
          seenAt: i.seenAt,
          isArchived: i.isArchived,
          status: i.status,
          createdAt: i.createdAt,
          notification: {
            id: i.notification.id,
            title: i.notification.title,
            body: i.notification.body,
            templateKey: i.notification.templateKey,
            data: i.notification.data,
          },
        })),
        meta: { page, limit, total },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Abrufen der Benachrichtigungen",
      details: String(error),
    };
  }
};

/**
 * getNotificationById: returns recipient row (ensures recipient belongs to user)
 */
export const getNotificationById = async (
  recipientId: string,
  userId: string
) => {
  try {
    const rec = await prisma.notificationRecipient.findFirst({
      where: { id: recipientId, userId },
      include: { notification: true },
    });
    return {
      success: true,
      data: rec,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Abrufen der Benachrichtigung",
      details: String(error),
    };
  }
};

/**
 * createNotification: creates notification + recipients in a transaction, enqueues for workers.
 * If queue add fails, falls back to creating a NotificationOutbox row for worker polling.
 */
export const createNotification = async (input: CreateNotificationInput) => {
  try {
    const { templateKey, title, body, data, recipients, createdBy } = input;

    // Validate all recipient userIds exist
    const userIds = recipients.map((r) => r.userId);
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });

    const existingUserIds = new Set(existingUsers.map((u) => u.id));
    const invalidUserIds = userIds.filter((id) => !existingUserIds.has(id));

    if (invalidUserIds.length > 0) {
      return {
        success: false,
        error: `Ungültige Benutzer-IDs: ${invalidUserIds.join(", ")}`,
      };
    }

    // Persist the notification first so the request never depends on Redis.
    const notif = await prisma.notification.create({
      data: {
        templateKey,
        title,
        body,
        data,
        category: data?.category,
        createdBy,
        recipients: {
          create: recipients.map((r) => ({
            userId: r.userId,
            channels: r.channels ?? ["in_app", "email"],
          })),
        },
      },
      include: { recipients: true },
    });

    // try enqueueing (bounded so an unreachable Redis can't block the request)
    try {
      await enqueueWithTimeout(
        "processNotification",
        { notificationId: notif.id },
        {
          removeOnComplete: true,
          attempts: 5,
          backoff: { type: "exponential", delay: 1000 },
        }
      );
    } catch (queueErr) {
      console.error(
        "Failed to enqueue notification job; saving to outbox",
        queueErr
      );
      // fallback: create outbox entries per recipient/channel
      const outboxCreates = [];
      for (const rec of notif.recipients) {
        for (const channel of rec.channels || ["in_app"]) {
          outboxCreates.push(
            prisma.notificationOutbox.create({
              data: {
                notificationId: notif.id,
                payload: {
                  recipientId: rec.id,
                  channel,
                  notification: {
                    id: notif.id,
                    title: notif.title,
                    body: notif.body,
                    data: notif.data,
                  },
                },
                channel,
              },
            })
          );
        }
      }
      await Promise.all(outboxCreates);
    }

    return {
      success: true,
      data: notif,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Erstellen der Benachrichtigung",
      details: String(error),
    };
  }
};

/**
 * markAsRead: mark a recipient row as read (only by owner)
 */
export const markAsRead = async (recipientId: string, userId: string) => {
  try {
    // updateMany ensures safety (only owner)
    await prisma.notificationRecipient.updateMany({
      where: { id: recipientId, userId },
      data: { readAt: new Date() },
    });
    return {
      success: true,
      message: "Benachrichtigung als gelesen markiert",
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Markieren der Benachrichtigung als gelesen",
      details: String(error),
    };
  }
};

/**
 * markAllAsRead: mark all unread notifications as read for a user
 */
export const markAllAsRead = async (userId: string) => {
  try {
    const result = await prisma.notificationRecipient.updateMany({
      where: { 
        userId, 
        readAt: null, 
        isArchived: false 
      },
      data: { readAt: new Date() },
    });
    return {
      success: true,
      data: { count: result.count },
      message: `${result.count} Benachrichtigungen als gelesen markiert`,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Markieren aller Benachrichtigungen als gelesen",
      details: String(error),
    };
  }
};

/**
 * archiveNotification: archive a recipient row (only by owner)
 */
export const archiveNotification = async (
  recipientId: string,
  userId: string
) => {
  try {
    await prisma.notificationRecipient.updateMany({
      where: { id: recipientId, userId },
      data: { isArchived: true },
    });
    return {
      success: true,
      message: "Benachrichtigung archiviert",
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Archivieren der Benachrichtigung",
      details: String(error),
    };
  }
};

/**
 * getUnreadCount: quick count for user's unread notifications
 */
export const getUnreadCount = async (userId: string) => {
  try {
    const count = await prisma.notificationRecipient.count({
      where: { userId, readAt: null, isArchived: false },
    });
    return {
      success: true,
      data: count,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Abrufen der Anzahl ungelesener Nachrichten",
      details: String(error),
    };
  }
};

/**
 * getPreferences: fetch or create a default preference row for user
 */
export const getPreferences = async (userId: string) => {
  try {
    let pref = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!pref) {
      pref = await prisma.notificationPreference.create({
        data: {
          userId,
          channels: ["in_app", "email"],
          quietHoursStart: null,
          quietHoursEnd: null,
          digestEnabled: false,
        },
      });
    }
    return {
      success: true,
      data: pref,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Abrufen der Einstellungen",
      details: String(error),
    };
  }
};

/**
 * updatePreferences: upsert preferences for user
 */
export const updatePreferences = async (
  userId: string,
  payload: Partial<{
    channels: string[];
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    digestEnabled: boolean;
  }>
) => {
  try {
    const pref = await prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        channels: payload.channels ?? undefined,
        quietHoursStart: payload.quietHoursStart ?? undefined,
        quietHoursEnd: payload.quietHoursEnd ?? undefined,
        digestEnabled: payload.digestEnabled ?? undefined,
      },
      create: {
        userId,
        channels: payload.channels ?? ["in_app", "email"],
        quietHoursStart: payload.quietHoursStart ?? null,
        quietHoursEnd: payload.quietHoursEnd ?? null,
        digestEnabled: payload.digestEnabled ?? false,
      },
    });

    return {
      success: true,
      data: pref,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Aktualisieren der Einstellungen",
      details: String(error),
    };
  }
};

/**
 * updateNotificationStatus: update notification status (PENDING, SENT, FAILED)
 */
export const updateNotificationStatus = async (
  notificationId: string,
  status: string,
  deliveredAt?: Date
) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status,
        ...(deliveredAt && { deliveredAt }),
      },
    });
    return {
      success: true,
      data: notification,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Aktualisieren des Benachrichtigungsstatus",
      details: String(error),
    };
  }
};

/**
 * updateRecipientStatus: update recipient status (PENDING, SENT, FAILED)
 */
export const updateRecipientStatus = async (
  recipientId: string,
  status: string,
  error?: string
) => {
  try {
    const recipient = await prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: {
        status,
        ...(error && { error }),
      },
    });
    return {
      success: true,
      data: recipient,
    };
  } catch (error) {
    return {
      success: false,
      error: "Fehler beim Aktualisieren des Empfängerstatus",
      details: String(error),
    };
  }
};