import { ObjectId } from "mongodb";
import { getDatabase } from "../database/mongodb.js";

export type CommissionStatus =
  | "pending"
  | "accepted"
  | "working"
  | "delivered"
  | "completed"
  | "cancelled";

export interface Commission {
  id: string;
  number: number;
  guildId: string;
  clientId: string;
  designerId: string;
  work: string;
  status: CommissionStatus;
  ticketChannelId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CommissionDocument extends Omit<Commission, "id"> {
  _id: ObjectId;
}

interface CounterDocument { _id: string; value: number }

function toCommission(document: CommissionDocument): Commission {
  const { _id, ...commission } = document;
  return { id: _id.toHexString(), ...commission };
}

export async function createCommission(input: {
  guildId: string;
  clientId: string;
  designerId: string;
  work: string;
}): Promise<Commission> {
  const counter = await getDatabase().collection<CounterDocument>("guild_counters").findOneAndUpdate(
    { _id: `commission:${input.guildId}` },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  const now = new Date();
  const document: CommissionDocument = {
    _id: new ObjectId(),
    number: counter?.value ?? 1,
    ...input,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await getDatabase().collection<CommissionDocument>("commissions").insertOne(document);
  return toCommission(document);
}

export async function setCommissionTicket(id: string, ticketChannelId: string): Promise<void> {
  if (!ObjectId.isValid(id)) return;
  await getDatabase().collection<CommissionDocument>("commissions").updateOne(
    { _id: new ObjectId(id) },
    { $set: { ticketChannelId, updatedAt: new Date() } },
  );
}

export async function getCommission(id: string): Promise<Commission | null> {
  if (!ObjectId.isValid(id)) return null;
  const document = await getDatabase().collection<CommissionDocument>("commissions").findOne({ _id: new ObjectId(id) });
  return document ? toCommission(document) : null;
}

export async function transitionCommission(
  id: string,
  from: CommissionStatus | CommissionStatus[],
  to: CommissionStatus,
): Promise<Commission | null> {
  if (!ObjectId.isValid(id)) return null;
  const statuses = Array.isArray(from) ? from : [from];
  const document = await getDatabase().collection<CommissionDocument>("commissions").findOneAndUpdate(
    { _id: new ObjectId(id), status: { $in: statuses } },
    { $set: { status: to, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return document ? toCommission(document) : null;
}

export async function saveCommissionReview(
  commission: Commission,
  rating: number,
): Promise<boolean> {
  const result = await getDatabase().collection("commission_reviews").updateOne(
    { commissionId: commission.id },
    {
      $setOnInsert: {
        commissionId: commission.id,
        guildId: commission.guildId,
        designerId: commission.designerId,
        clientId: commission.clientId,
        rating,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return result.upsertedCount === 1;
}

export async function getDesignerRating(
  guildId: string,
  designerId: string,
): Promise<{ average: number; count: number }> {
  const [result] = await getDatabase().collection("commission_reviews").aggregate<{ average: number; count: number }>([
    { $match: { guildId, designerId } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
    { $project: { _id: 0, average: 1, count: 1 } },
  ]).toArray();
  return result ?? { average: 0, count: 0 };
}
