import {
  ChannelType,
  DiscordAPIError,
  MessageFlags,
  PermissionFlagsBits,
  Routes,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import { buildInviteMessage } from "../../invitations/invite-message.js";
import type { BotCommand, CommandContext } from "../types.js";

const USER_ID_PATTERN = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/;

const INVITABLE_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

async function resolveInviteChannelId(
  interaction: ChatInputCommandInteraction<"cached">,
): Promise<string> {
  const currentChannel = interaction.channel;

  if (currentChannel?.isThread()) {
    if (!currentChannel.parentId) {
      throw new Error("No se pudo determinar el canal padre de este hilo.");
    }

    return currentChannel.parentId;
  }

  if (currentChannel && INVITABLE_CHANNEL_TYPES.has(currentChannel.type)) {
    return currentChannel.id;
  }

  throw new Error(
    "Ejecuta el comando dentro de un canal del servidor que admita invitaciones.",
  );
}

async function userIsAlreadyMember(guild: Guild, userId: string): Promise<boolean> {
  const member = await guild.members.fetch(userId).catch(() => null);
  return member !== null;
}

interface TargetedInvite {
  code: string;
  url: string;
}

function hasInviteCode(value: unknown): value is { code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string"
  );
}

async function createTargetedInvite(
  interaction: ChatInputCommandInteraction<"cached">,
  channelId: string,
  targetUserId: string,
  context: CommandContext,
): Promise<TargetedInvite> {
  const result: unknown = await interaction.client.rest.post(
    Routes.channelInvites(channelId),
    {
      body: {
        max_age: context.config.inviteMaxAgeSeconds,
        max_uses: 1,
        unique: true,
      },
      files: [
        {
          data: targetUserId,
          name: "target-user.csv",
          contentType: "text/csv",
          key: "target_users_file",
        },
      ],
      reason: `Invitación dirigida solicitada por ${interaction.user.tag} para ${targetUserId}`,
    },
  );

  if (!hasInviteCode(result)) {
    throw new Error("Discord devolvió una respuesta de invitación inválida.");
  }

  return {
    code: result.code,
    url: `https://discord.gg/${result.code}`,
  };
}

export const invitarCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName("invitar")
    .setDescription("Envía por DM una invitación de un solo uso a un usuario.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("userid")
        .setDescription("ID o mención del usuario que recibirá la invitación.")
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(23),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "Este comando solo se puede ejecutar dentro del servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rawTarget = interaction.options.getString("userid", true).trim();
    const userIdMatch = rawTarget.match(USER_ID_PATTERN);

    if (!userIdMatch) {
      await interaction.editReply(
        "El valor no es un ID ni una mención válida. Activa el modo desarrollador, haz clic derecho sobre la cuenta y usa `Copiar ID de usuario`.",
      );
      return;
    }

    const targetUserId = userIdMatch[1] ?? userIdMatch[2];
    if (!targetUserId) return;

    let targetUser;
    try {
      targetUser = await interaction.client.users.fetch(targetUserId, { cache: false });
    } catch (error: unknown) {
      console.error(`[INVITAR] Discord rechazó el userID ${targetUserId}:`, error);
      const detail =
        error instanceof DiscordAPIError
          ? ` Discord respondió: ${error.message} (código ${error.code}).`
          : "";
      await interaction.editReply(
        `No pude encontrar la cuenta con ID \`${targetUserId}\`. Verifica que copiaste el ID del **usuario**, no el de un rol, canal o servidor.${detail}`,
      );
      return;
    }

    if (targetUser.bot) {
      await interaction.editReply("No se pueden enviar invitaciones de acceso a otros bots.");
      return;
    }

    if (await userIsAlreadyMember(interaction.guild, targetUser.id)) {
      await interaction.editReply(`${targetUser.username} ya pertenece a este servidor.`);
      return;
    }

    const channelId = await resolveInviteChannelId(interaction);
    const botMember = interaction.guild.members.me;
    const inviteChannel = await interaction.guild.channels.fetch(channelId);

    if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply(
        "Necesito el permiso `Manage Server` para crear invitaciones dirigidas a una cuenta.",
      );
      return;
    }

    if (
      !inviteChannel?.permissionsFor(botMember)?.has(PermissionFlagsBits.CreateInstantInvite)
    ) {
      await interaction.editReply(
        "Necesito el permiso `Create Invite` en el canal configurado para crear la invitación.",
      );
      return;
    }

    const invite = await createTargetedInvite(
      interaction,
      channelId,
      targetUser.id,
      context,
    );

    const expiresAt = new Date(Date.now() + context.config.inviteMaxAgeSeconds * 1_000);
    const inviteMessage = buildInviteMessage({
      guild: interaction.guild,
      inviter: interaction.user,
      target: targetUser,
      expiresAt,
      inviteUrl: invite.url,
    });

    try {
      await targetUser.send(inviteMessage);
    } catch {
      await interaction.editReply({
        content: [
          `Discord no me permitió iniciar un DM con **${targetUser.username}** porque todavía no comparte un servidor conmigo o su privacidad bloqueó el mensaje.`,
          "",
          "La invitación **no fue anulada**. Sigue siendo personal, de un solo uso y únicamente la cuenta indicada puede aceptarla.",
          "",
          `Envíale manualmente este enlace desde tu cuenta:\n${invite.url}`,
          "",
          `Caduca ${time(expiresAt, TimestampStyles.RelativeTime)}.`,
        ].join("\n"),
        components: inviteMessage.components,
      });
      return;
    }

    await interaction.editReply(
      `Invitación personal y de un solo uso enviada por DM a ${targetUser.username}. Caduca ${time(expiresAt, TimestampStyles.RelativeTime)}.`,
    );
  },
};
