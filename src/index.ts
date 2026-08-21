import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import { canExecuteCommand } from "./access-control.js";
import { printCommandTables, syncGuildCommands } from "./command-loader.js";
import { createCommandCollection } from "./commands/index.js";
import { loadConfig } from "./config.js";
import { handleDesignerInteraction } from "./designer-system/interactions.js";
import { applyPresence, loadPresence } from "./presence/store.js";
import { closeDatabase, connectDatabase } from "./database/mongodb.js";
import {
  configureCloudinary,
  verifyCloudinaryConnection,
} from "./media/cloudinary.js";
import { startBackupScheduler } from "./operations/backups.js";
import { reportImportantError } from "./operations/errors.js";
import { stopAllGeminiConversations } from "./voice/gemini-live.js";
import { startBirthdayScheduler } from "./birthdays/scheduler.js";
import { handleBirthdayInteraction } from "./birthdays/interactions.js";
import {
  startHealthServer,
  startSelfPing,
  type HealthServer,
} from "./health-server.js";

const config = loadConfig();
const commands = createCommandCollection();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
let applicationReady = false;
let healthServer: HealthServer | null = null;
let stopSelfPing: (() => void) | null = null;

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot conectado como ${readyClient.user.tag}.`);
  const storedPresence = await loadPresence().catch((error: unknown) => {
    console.error("No se pudo restaurar la presencia guardada:", error);
    return null;
  });
  if (storedPresence) applyPresence(readyClient, storedPresence);
  printCommandTables();
  startBackupScheduler(readyClient);
  startBirthdayScheduler(readyClient);

  const results = await Promise.allSettled(
    readyClient.guilds.cache.map((guild) => syncGuildCommands(guild)),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("No se pudieron sincronizar comandos en un servidor:", result.reason);
    }
  }
});

client.on(Events.GuildCreate, async (guild) => {
  await syncGuildCommands(guild).catch((error: unknown) => {
    console.error(`No se pudieron sincronizar comandos en ${guild.name}:`, error);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await handleBirthdayInteraction(interaction, config.developerUserId)) return;
  } catch (error: unknown) {
    await reportImportantError(client, error, "Configuración del embed de cumpleaños", interaction.guildId);
    if (interaction.isRepliable()) {
      const content = "No pude guardar el embed de cumpleaños. Inténtalo nuevamente.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
    return;
  }

  try {
    if (await handleDesignerInteraction(interaction)) return;
  } catch (error: unknown) {
    await reportImportantError(client, error, "Interacción del sistema Designer/Comisiones", interaction.guildId);
    if (interaction.isRepliable()) {
      const content = "Ocurrió un error en el sistema de diseñadores. Inténtalo nuevamente.";
      if (interaction.deferred || interaction.replied) {
        await interaction
          .followUp({ content, flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      } else {
        await interaction
          .reply({ content, flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commands.get(interaction.commandName);

  if (!command) {
    await interaction.reply({
      content: "Este comando no está disponible en esta versión del bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canExecuteCommand(command, interaction, config.developerUserId)) {
    await interaction.reply({
      content: "No tienes autorización para ejecutar este comando.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction, { config });
  } catch (error: unknown) {
    await reportImportantError(client, error, `Ejecución de /${interaction.commandName}`, interaction.guildId);

    const errorMessage =
      "Ocurrió un error al ejecutar el comando. Revisa mis permisos y vuelve a intentarlo.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: errorMessage });
    } else {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

async function start(): Promise<void> {
  configureCloudinary(config.cloudinaryUrl);
  try {
    await Promise.all([
      connectDatabase(config.mongodbUri, config.mongodbDbName),
      verifyCloudinaryConnection(),
    ]);
  } catch (error: unknown) {
    await closeDatabase().catch(() => undefined);
    throw error;
  }
  await client.login(config.token);
}

async function shutdown(): Promise<void> {
  applicationReady = false;
  stopSelfPing?.();
  stopSelfPing = null;
  await stopAllGeminiConversations();
  client.destroy();
  await closeDatabase();
  await healthServer?.stop();
  healthServer = null;
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

client.on("error", (error) => void reportImportantError(client, error, "Error del cliente de Discord"));
process.on("unhandledRejection", (error) => void reportImportantError(client, error, "Promesa rechazada sin manejar"));
process.once("uncaughtException", (error) => {
  void reportImportantError(client, error, "Excepción no capturada")
    .finally(() => shutdown())
    .finally(() => process.exit(1));
});

async function boot(): Promise<void> {
  healthServer = await startHealthServer({
    port: config.port,
    isReady: () => applicationReady && client.isReady(),
  });
  await start();
  applicationReady = true;
  stopSelfPing = startSelfPing(config.urlPing);
}

boot().catch((error: unknown) => {
  console.error("No se pudo iniciar el bot:", error);
  void shutdown().finally(() => process.exit(1));
});
