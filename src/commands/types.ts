import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { BotConfig } from "../config.js";

export type CommandAccess = "public" | "admin" | "dev";

export interface CommandContext {
  config: BotConfig;
}

export interface BotCommand {
  active: boolean;
  access: CommandAccess;
  requiredPermission?: bigint;
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void>;
}
