import {
  PermissionFlagsBits,
  type Guild,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { adminCommands } from "./commands/admin/index.js";
import { devCommands } from "./commands/dev/index.js";
import { publicCommands } from "./commands/public/index.js";
import { commands } from "./commands/index.js";
import type { BotCommand, CommandAccess } from "./commands/types.js";

function commandPayload(command: BotCommand): RESTPostAPIApplicationCommandsJSONBody {
  const payload = command.data.toJSON();

  if (command.access === "public") {
    payload.default_member_permissions = null;
  } else if (command.access === "admin") {
    payload.default_member_permissions = (
      command.requiredPermission ?? PermissionFlagsBits.ManageGuild
    ).toString();
  } else {
    payload.default_member_permissions = "0";
  }

  return payload;
}

export async function syncGuildCommands(guild: Guild): Promise<void> {
  const payloads = commands.filter((command) => command.active).map(commandPayload);
  await guild.commands.set(payloads);
  console.log(`[SLASH] ${payloads.length} comando(s) sincronizados en ${guild.name}.`);
}

function printTable(title: string, categoryCommands: readonly BotCommand[]): void {
  const rows: Array<readonly [string, string]> = categoryCommands.length
    ? categoryCommands.map((command) => [
        `/${command.data.name}`,
        command.active ? "ACTIVO" : "INACTIVO",
      ] as const)
    : [["(sin comandos)", "-"]];
  const headers = ["COMANDO", "ESTADO"] as const;
  const commandWidth = Math.max(headers[0].length, ...rows.map(([name]) => name.length));
  const statusWidth = Math.max(headers[1].length, ...rows.map(([, status]) => status.length));
  const border = `+${"-".repeat(commandWidth + 2)}+${"-".repeat(statusWidth + 2)}+`;
  const formatRow = ([name, status]: readonly [string, string]) =>
    `| ${name.padEnd(commandWidth)} | ${status.padEnd(statusWidth)} |`;

  console.log(`\nCOMANDOS ${title}`);
  console.log(border);
  console.log(formatRow(headers));
  console.log(border);
  for (const row of rows) console.log(formatRow(row));
  console.log(border);
}

export function printCommandTables(): void {
  const categories: ReadonlyArray<[
    string,
    CommandAccess,
    readonly BotCommand[],
  ]> = [
    ["ADMIN", "admin", adminCommands],
    ["PUBLIC", "public", publicCommands],
    ["DEV", "dev", devCommands],
  ];

  for (const [title, access, categoryCommands] of categories) {
    if (categoryCommands.some((command) => command.access !== access)) {
      throw new Error(`Hay un comando en la categoría ${title} con acceso incorrecto.`);
    }
    printTable(title, categoryCommands);
  }
}
