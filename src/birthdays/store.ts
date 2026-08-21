import { MongoServerError } from "mongodb";
import { getDatabase } from "../database/mongodb.js";

export interface Birthday {
  guildId: string;
  userId: string;
  month: number;
  day: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BirthdayDocument extends Birthday {
  _id?: unknown;
}

interface BirthdayAnnouncementDocument {
  _id: string;
  guildId: string;
  userId: string;
  dateKey: string;
  createdAt: Date;
}

export function isValidBirthday(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(2024, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function saveBirthday(
  guildId: string,
  userId: string,
  month: number,
  day: number,
): Promise<void> {
  const now = new Date();
  await getDatabase().collection<BirthdayDocument>("birthdays").updateOne(
    { guildId, userId },
    {
      $set: { month, day, updatedAt: now },
      $setOnInsert: { guildId, userId, createdAt: now },
    },
    { upsert: true },
  );
}

export async function deleteBirthday(guildId: string, userId: string): Promise<boolean> {
  const result = await getDatabase().collection<BirthdayDocument>("birthdays").deleteOne({
    guildId,
    userId,
  });
  return result.deletedCount > 0;
}

export async function listBirthdaysForMonth(guildId: string, month: number): Promise<Birthday[]> {
  return getDatabase()
    .collection<BirthdayDocument>("birthdays")
    .find({ guildId, month })
    .sort({ day: 1, userId: 1 })
    .toArray() as Promise<Birthday[]>;
}

export async function listBirthdaysForDay(
  guildId: string,
  month: number,
  day: number,
  includeLeapDay: boolean,
): Promise<Birthday[]> {
  const dates = includeLeapDay
    ? [{ month, day }, { month: 2, day: 29 }]
    : [{ month, day }];
  return getDatabase()
    .collection<BirthdayDocument>("birthdays")
    .find({ guildId, $or: dates })
    .toArray() as Promise<Birthday[]>;
}

export async function claimBirthdayAnnouncement(
  guildId: string,
  userId: string,
  dateKey: string,
): Promise<boolean> {
  try {
    await getDatabase().collection<BirthdayAnnouncementDocument>("birthday_announcements").insertOne({
      _id: `${guildId}:${userId}:${dateKey}`,
      guildId,
      userId,
      dateKey,
      createdAt: new Date(),
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof MongoServerError && error.code === 11000) return false;
    throw error;
  }
}

export async function releaseBirthdayAnnouncement(
  guildId: string,
  userId: string,
  dateKey: string,
): Promise<void> {
  await getDatabase().collection<BirthdayAnnouncementDocument>("birthday_announcements").deleteOne({
    _id: `${guildId}:${userId}:${dateKey}`,
  });
}
