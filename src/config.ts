import "dotenv/config";

export interface BotConfig {
  token: string;
  developerUserId: string;
  geminiApiKey: string | null;
  geminiLiveModel: string;
  mongodbUri: string;
  mongodbDbName: string;
  cloudinaryUrl: string;
  inviteMaxAgeSeconds: number;
  port: number;
  urlPing: string | null;
}

function developerUserId(): string {
  const value = required("DEVELOPER_USER_ID");
  if (!/^\d{17,20}$/.test(value)) {
    throw new Error("DEVELOPER_USER_ID debe ser un ID numérico válido de Discord.");
  }
  return value;
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria ${name}.`);
  }

  return value;
}

function inviteLifetime(): number {
  const rawValue = process.env.INVITE_MAX_AGE_SECONDS?.trim() || "900";
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 60 || value > 604_800) {
    throw new Error("INVITE_MAX_AGE_SECONDS debe ser un entero entre 60 y 604800.");
  }

  return value;
}

function serverPort(): number {
  const value = Number(process.env.PORT?.trim() || "3000");
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("PORT debe ser un número entero entre 1 y 65535.");
  }
  return value;
}

function pingUrl(): string | null {
  const rawValue = process.env.URL_PING?.trim();
  if (!rawValue) return null;
  const value = new URL(rawValue);
  if (!(["http:", "https:"] as string[]).includes(value.protocol)) {
    throw new Error("URL_PING debe utilizar http:// o https://.");
  }
  return value.toString();
}

export function loadConfig(): BotConfig {
  return {
    token: required("DISCORD_TOKEN"),
    developerUserId: developerUserId(),
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    geminiLiveModel:
      process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.1-flash-live-preview",
    mongodbUri: required("MONGODB_URI"),
    mongodbDbName: process.env.MONGODB_DB_NAME?.trim() || "nebu_bot",
    cloudinaryUrl: required("CLOUDINARY_URL"),
    inviteMaxAgeSeconds: inviteLifetime(),
    port: serverPort(),
    urlPing: pingUrl(),
  };
}
