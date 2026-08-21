import { Collection } from "discord.js";
import { adminCommands } from "./admin/index.js";
import { devCommands } from "./dev/index.js";
import { publicCommands } from "./public/index.js";
import type { BotCommand } from "./types.js";

export const commands = [
  ...publicCommands,
  ...adminCommands,
  ...devCommands,
] as const;

export function createCommandCollection(): Collection<string, BotCommand> {
  const collection = new Collection<string, BotCommand>();

  for (const command of commands) {
    const commandName = command.data.name;

    if (collection.has(commandName)) {
      throw new Error(`El comando /${commandName} está registrado más de una vez.`);
    }

    if (command.active) {
      collection.set(commandName, command);
    }
  }

  return collection;
}
