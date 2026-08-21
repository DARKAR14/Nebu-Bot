import { ActivityType, type Client } from "discord.js";
import { getDatabase } from "../database/mongodb.js";

export type BotPresenceStatus = "online" | "idle" | "dnd" | "invisible";

export interface StoredPresence {
  text: string;
  activityType: ActivityType.Playing | ActivityType.Watching | ActivityType.Listening | ActivityType.Competing;
  status: BotPresenceStatus;
}

interface PresenceDocument extends StoredPresence {
  _id: "presence";
  updatedAt: Date;
}

export async function savePresence(presence: StoredPresence): Promise<void> {
  await getDatabase()
    .collection<PresenceDocument>("bot_settings")
    .updateOne(
      { _id: "presence" },
      { $set: { ...presence, updatedAt: new Date() } },
      { upsert: true },
    );
}

export async function loadPresence(): Promise<StoredPresence | null> {
  const document = await getDatabase()
    .collection<PresenceDocument>("bot_settings")
    .findOne({ _id: "presence" });
  if (!document) return null;
  return {
    text: document.text,
    activityType: document.activityType,
    status: document.status,
  };
}

export function applyPresence(client: Client<true>, presence: StoredPresence): void {
  client.user.setPresence({
    activities: [{ name: presence.text, type: presence.activityType }],
    status: presence.status,
  });
}
