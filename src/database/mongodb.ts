import { MongoClient, ServerApiVersion, type Db } from "mongodb";

let client: MongoClient | null = null;
let database: Db | null = null;

interface DnsOverHttpsAnswer {
  data: string;
  type: number;
}

interface DnsOverHttpsResponse {
  Answer?: DnsOverHttpsAnswer[];
  Status: number;
}

const SRV_RECORD_TYPE = 33;
const TXT_RECORD_TYPE = 16;

function isSrvDnsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const code = "code" in error ? String(error.code) : "";
  return (
    error.message.includes("querySrv") &&
    ["ECONNREFUSED", "ETIMEOUT", "ESERVFAIL", "EAI_AGAIN"].includes(code)
  );
}

async function queryDnsOverHttps(
  name: string,
  type: "SRV" | "TXT",
): Promise<DnsOverHttpsAnswer[]> {
  const endpoint = new URL("https://dns.google/resolve");
  endpoint.searchParams.set("name", name);
  endpoint.searchParams.set("type", type);

  const response = await fetch(endpoint, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`El DNS por HTTPS respondió con HTTP ${response.status}.`);
  }

  const result = (await response.json()) as DnsOverHttpsResponse;
  if (result.Status !== 0) {
    throw new Error(`El DNS por HTTPS devolvió el estado ${result.Status}.`);
  }

  return result.Answer ?? [];
}

function decodeTxtRecord(record: string): string {
  return record.replace(/^"|"$/g, "").replace(/"\s+"/g, "");
}

async function convertSrvUriToStandardUri(uri: string): Promise<string> {
  const parsed = new URL(uri);
  if (parsed.protocol !== "mongodb+srv:") {
    throw new Error("La URI de MongoDB no utiliza el formato SRV.");
  }

  const srvName = `_mongodb._tcp.${parsed.hostname}`;
  const [srvAnswers, txtAnswers] = await Promise.all([
    queryDnsOverHttps(srvName, "SRV"),
    queryDnsOverHttps(parsed.hostname, "TXT"),
  ]);

  const hosts = srvAnswers
    .filter((answer) => answer.type === SRV_RECORD_TYPE)
    .map((answer) => {
      const parts = answer.data.trim().split(/\s+/);
      const port = parts.at(-2);
      const hostname = parts.at(-1)?.replace(/\.$/, "");
      if (!hostname || !port || !/^\d+$/.test(port)) return null;
      return `${hostname}:${port}`;
    })
    .filter((host): host is string => host !== null);

  if (hosts.length === 0) {
    throw new Error("El DNS por HTTPS no devolvió nodos para el clúster de Atlas.");
  }

  for (const answer of txtAnswers.filter(
    (candidate) => candidate.type === TXT_RECORD_TYPE,
  )) {
    const txtOptions = new URLSearchParams(decodeTxtRecord(answer.data));
    for (const [key, value] of txtOptions) {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    }
  }

  parsed.searchParams.set("tls", "true");
  const credentials = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
    : "";
  const query = parsed.searchParams.toString();

  return `mongodb://${credentials}${hosts.join(",")}${parsed.pathname}${query ? `?${query}` : ""}`;
}

function createMongoClient(uri: string): MongoClient {
  return new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
}

export async function connectDatabase(uri: string, databaseName: string): Promise<void> {
  if (database) return;

  client = createMongoClient(uri);
  try {
    await client.connect();
  } catch (error: unknown) {
    await client.close().catch(() => undefined);

    if (!isSrvDnsError(error) || !uri.startsWith("mongodb+srv://")) {
      client = null;
      throw error;
    }

    console.warn(
      "[MONGODB] El DNS local rechazó la consulta SRV; usando resolución DNS segura por HTTPS.",
    );
    const standardUri = await convertSrvUriToStandardUri(uri);
    client = createMongoClient(standardUri);
    await client.connect();
  }

  database = client.db(databaseName);
  await database.command({ ping: 1 });

  await Promise.all([
    database.collection("designer_applications").createIndex(
      { guildId: 1, userId: 1 },
      { unique: true },
    ),
    database.collection("designer_availability").createIndex(
      { guildId: 1, available: 1 },
    ),
    database.collection("moderation_cases").createIndex(
      { guildId: 1, caseNumber: 1 },
      { unique: true },
    ),
    database.collection("commissions").createIndex({ guildId: 1, clientId: 1, status: 1 }),
    database.collection("commissions").createIndex({ guildId: 1, designerId: 1, status: 1 }),
    database.collection("commission_reviews").createIndex(
      { commissionId: 1 },
      { unique: true },
    ),
    database.collection("designer_profiles").createIndex(
      { guildId: 1, userId: 1 },
      { unique: true },
    ),
    database.collection("birthdays").createIndex(
      { guildId: 1, userId: 1 },
      { unique: true },
    ),
    database.collection("birthdays").createIndex({ guildId: 1, month: 1, day: 1 }),
    database.collection("birthday_announcements").createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 400 * 24 * 60 * 60 },
    ),
  ]);
  console.log(`[MONGODB] Conectado a la base de datos ${databaseName}.`);
}

export function getDatabase(): Db {
  if (!database) {
    throw new Error("MongoDB no ha sido inicializado.");
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = null;
  database = null;
}
