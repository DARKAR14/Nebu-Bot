import { getDatabase } from "../database/mongodb.js";

export interface GuildDesignerConfig {
  roleId: string;
  reviewChannelId: string;
}

export interface DesignerApplication {
  guildId: string;
  userId: string;
  introduction: string;
  artStyle: string;
  imageUrl: string;
  imagePublicId: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
}

export interface DesignerProfileSample {
  imageUrl: string;
  imagePublicId: string;
}

export interface DesignerProfile {
  guildId: string;
  userId: string;
  specialties: string;
  prices: string;
  samples: DesignerProfileSample[];
  updatedAt: Date;
}

interface GuildDesignerConfigDocument extends GuildDesignerConfig {
  _id: string;
}

interface DesignerApplicationDocument extends DesignerApplication {
  _id: string;
}

interface DesignerAvailabilityDocument {
  _id: string;
  guildId: string;
  userId: string;
  available: boolean;
  updatedAt: Date;
}

interface DesignerProfileDocument extends DesignerProfile {
  _id: string;
}

function recordKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export async function getDesignerConfig(
  guildId: string,
): Promise<GuildDesignerConfig | null> {
  const document = await getDatabase()
    .collection<GuildDesignerConfigDocument>("designer_guilds")
    .findOne({ _id: guildId });
  return document
    ? { roleId: document.roleId, reviewChannelId: document.reviewChannelId }
    : null;
}

export async function setDesignerConfig(
  guildId: string,
  config: GuildDesignerConfig,
): Promise<void> {
  await getDatabase()
    .collection<GuildDesignerConfigDocument>("designer_guilds")
    .updateOne(
      { _id: guildId },
      { $set: { roleId: config.roleId, reviewChannelId: config.reviewChannelId } },
      { upsert: true },
    );
}

export async function getApplication(
  guildId: string,
  userId: string,
): Promise<DesignerApplication | null> {
  const document = await getDatabase()
    .collection<DesignerApplicationDocument>("designer_applications")
    .findOne({ _id: recordKey(guildId, userId) });
  if (!document) return null;
  const { _id: _ignored, ...application } = document;
  return application;
}

export async function saveApplication(application: DesignerApplication): Promise<void> {
  const _id = recordKey(application.guildId, application.userId);
  await getDatabase()
    .collection<DesignerApplicationDocument>("designer_applications")
    .replaceOne({ _id }, application, { upsert: true });
}

export async function setApplicationStatus(
  guildId: string,
  userId: string,
  status: DesignerApplication["status"],
): Promise<void> {
  await getDatabase()
    .collection<DesignerApplicationDocument>("designer_applications")
    .updateOne({ _id: recordKey(guildId, userId) }, { $set: { status } });
}

export async function setDesignerAvailability(
  guildId: string,
  userId: string,
  available: boolean,
): Promise<void> {
  await getDatabase()
    .collection<DesignerAvailabilityDocument>("designer_availability")
    .updateOne(
      { _id: recordKey(guildId, userId) },
      { $set: { guildId, userId, available, updatedAt: new Date() } },
      { upsert: true },
    );
}

export async function getAvailableDesignerIds(guildId: string): Promise<string[]> {
  const documents = await getDatabase()
    .collection<DesignerAvailabilityDocument>("designer_availability")
    .find({ guildId, available: true })
    .project<{ userId: string }>({ userId: 1, _id: 0 })
    .toArray();
  return documents.map((document) => document.userId);
}

export async function claimDesignerAvailability(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const result = await getDatabase()
    .collection<DesignerAvailabilityDocument>("designer_availability")
    .findOneAndUpdate(
      { _id: recordKey(guildId, userId), available: true },
      { $set: { available: false, updatedAt: new Date() } },
    );
  return result !== null;
}

export async function getDesignerProfile(
  guildId: string,
  userId: string,
): Promise<DesignerProfile | null> {
  const document = await getDatabase().collection<DesignerProfileDocument>("designer_profiles").findOne({ _id: recordKey(guildId, userId) });
  if (!document) return null;
  const { _id: _ignored, ...profile } = document;
  return profile;
}

export async function saveDesignerProfile(
  guildId: string,
  userId: string,
  specialties: string,
  prices: string,
  sample?: DesignerProfileSample,
): Promise<DesignerProfileSample[]> {
  const current = await getDesignerProfile(guildId, userId);
  const samples = [...(current?.samples ?? []), ...(sample ? [sample] : [])];
  const removed = samples.length > 5 ? samples.slice(0, samples.length - 5) : [];
  const kept = samples.slice(-5);
  await getDatabase().collection<DesignerProfileDocument>("designer_profiles").updateOne(
    { _id: recordKey(guildId, userId) },
    { $set: { guildId, userId, specialties, prices, samples: kept, updatedAt: new Date() } },
    { upsert: true },
  );
  return removed;
}
