export interface StoredCloudinaryImage {
  secureUrl: string;
  publicId: string;
}

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

let credentials: CloudinaryCredentials | null = null;

export function configureCloudinary(cloudinaryUrl: string): void {
  const url = new URL(cloudinaryUrl);
  if (url.protocol !== "cloudinary:") {
    throw new Error("CLOUDINARY_URL debe comenzar con cloudinary://.");
  }

  const cloudName = url.hostname;
  const apiKey = decodeURIComponent(url.username);
  const apiSecret = decodeURIComponent(url.password);
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("CLOUDINARY_URL no contiene cloud name, API key y API secret.");
  }
  credentials = { cloudName, apiKey, apiSecret };
}

async function getCloudinary() {
  if (!credentials) throw new Error("Cloudinary no ha sido inicializado.");
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
  });
  return cloudinary;
}

export async function verifyCloudinaryConnection(): Promise<void> {
  const cloudinary = await getCloudinary();
  await cloudinary.api.ping();
  console.log("[CLOUDINARY] Conexión verificada.");
}

export async function uploadDesignerImage(
  sourceUrl: string,
  guildId: string,
  userId: string,
): Promise<StoredCloudinaryImage> {
  const cloudinary = await getCloudinary();
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: "image",
    folder: `nebu-bot/designers/${guildId}/${userId}`,
    public_id: `sample-${Date.now()}`,
    overwrite: false,
  });
  return { secureUrl: result.secure_url, publicId: result.public_id };
}

export async function uploadPortfolioImage(
  sourceUrl: string,
  guildId: string,
  userId: string,
): Promise<StoredCloudinaryImage> {
  const cloudinary = await getCloudinary();
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: "image",
    folder: `nebu-bot/portfolios/${guildId}/${userId}`,
    public_id: `sample-${Date.now()}`,
    overwrite: false,
  });
  return { secureUrl: result.secure_url, publicId: result.public_id };
}

export async function uploadBirthdayImage(
  sourceUrl: string,
  guildId: string,
): Promise<StoredCloudinaryImage> {
  const cloudinary = await getCloudinary();
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: "image",
    folder: `nebu-bot/birthdays/${guildId}`,
    public_id: `embed-${Date.now()}`,
    overwrite: false,
  });
  return { secureUrl: result.secure_url, publicId: result.public_id };
}

export async function uploadBoostImage(
  sourceUrl: string,
  guildId: string,
): Promise<StoredCloudinaryImage> {
  const cloudinary = await getCloudinary();
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: "image",
    folder: `nebu-bot/boosts/${guildId}`,
    public_id: `embed-${Date.now()}`,
    overwrite: false,
  });
  return { secureUrl: result.secure_url, publicId: result.public_id };
}

export async function getCloudinaryStatus(): Promise<boolean> {
  const cloudinary = await getCloudinary();
  return cloudinary.api.ping().then(() => true).catch(() => false);
}

export async function deleteDesignerImage(publicId: string): Promise<void> {
  const cloudinary = await getCloudinary();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
}

export async function deleteBirthdayImage(publicId: string): Promise<void> {
  await deleteDesignerImage(publicId);
}

export async function deleteBoostImage(publicId: string): Promise<void> {
  await deleteDesignerImage(publicId);
}
