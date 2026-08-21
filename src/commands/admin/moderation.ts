import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { createModerationCase } from "../../moderation/cases.js";

const MODERATOR_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.ManageMessages,
] as const;

export async function requireGuild(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (interaction.inCachedGuild()) return true;

  await interaction.reply({
    content: "Este comando solo se puede ejecutar dentro del servidor.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

export function moderationDenialReason(
  actor: GuildMember,
  target: GuildMember,
): string | null {
  if (actor.id === target.id) {
    return "No puedes usar este comando contra ti mismo.";
  }

  if (target.id === target.guild.ownerId) {
    return "No puedes moderar al dueño del servidor.";
  }

  if (target.permissions.any(MODERATOR_PERMISSIONS)) {
    return "No puedes usar este comando contra otro moderador o administrador.";
  }

  const actorIsOwner = actor.id === actor.guild.ownerId;
  if (!actorIsOwner && target.roles.highest.position >= actor.roles.highest.position) {
    return "No puedes moderar a alguien con un rol igual o superior al tuyo.";
  }

  const botMember = target.guild.members.me;
  if (!botMember || target.roles.highest.position >= botMember.roles.highest.position) {
    return "No puedo moderar a ese usuario: mi rol debe estar por encima de su rol más alto.";
  }

  return null;
}

export function auditReason(
  interaction: ChatInputCommandInteraction,
  reason: string | null,
): string {
  return `${reason?.trim() || "Sin motivo especificado"} | Moderador: ${interaction.user.tag} (${interaction.user.id})`;
}

export async function recordModerationCase(
  interaction: ChatInputCommandInteraction,
  action: string,
  reason: string | null,
  target?: { id: string; tag?: string },
  details?: string,
): Promise<number | null> {
  if (!interaction.guild) return null;
  return createModerationCase({
    guild: interaction.guild,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    action,
    reason,
    ...(target?.id ? { targetId: target.id } : {}),
    ...(target?.tag ? { targetTag: target.tag } : {}),
    ...(details ? { details } : {}),
  });
}
