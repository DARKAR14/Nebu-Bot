import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import type { BotCommand } from "./commands/types.js";

type UserAccess = "public" | "admin" | "dev";

function getUserAccess(
  interaction: ChatInputCommandInteraction,
  developerUserId: string,
): UserAccess {
  if (interaction.user.id === developerUserId) {
    return "dev";
  }

  if (!interaction.inCachedGuild()) {
    return "public";
  }

  // PermissionsBitField.has incluye automáticamente a Administrator.
  const hasAdminPermission = interaction.member.permissions.has(
    PermissionFlagsBits.ManageGuild,
  );

  return hasAdminPermission ? "admin" : "public";
}

export function canExecuteCommand(
  command: BotCommand,
  interaction: ChatInputCommandInteraction,
  developerUserId: string,
): boolean {
  const userAccess = getUserAccess(interaction, developerUserId);

  if (userAccess === "dev") {
    return true;
  }

  if (command.access === "public") {
    return true;
  }

  return (
    command.access === "admin" &&
    interaction.inCachedGuild() &&
    interaction.member.permissions.has(
      command.requiredPermission ?? PermissionFlagsBits.ManageGuild,
    )
  );
}
