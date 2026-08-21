import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  VoiceConnectionUnavailableError,
  getGeminiConversationStatus,
  startGeminiConversation,
  stopGeminiConversation,
} from "../../voice/gemini-live.js";
import { reportImportantError } from "../../operations/errors.js";
import type { BotCommand, CommandContext } from "../types.js";

export const hablarCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("hablar")
    .setDescription("Conversa por voz con Nebu mediante Gemini Live.")
    .addSubcommand((subcommand) =>
      subcommand.setName("conectar").setDescription("Conecta a Nebu a tu canal de voz."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desconectar").setDescription("Finaliza la conversación de voz."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("estado").setDescription("Muestra el estado de la conversación."),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getSubcommand();
    const status = getGeminiConversationStatus(interaction.guild.id);
    if (action === "estado") {
      await interaction.reply({
        content: status
          ? `Gemini Live está conversando en <#${status.channelId}> desde ${time(status.startedAt, TimestampStyles.RelativeTime)}.`
          : "No hay una conversación de voz activa.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (action === "desconectar") {
      if (!status) {
        await interaction.reply({ content: "No hay una conversación activa.", flags: MessageFlags.Ephemeral });
        return;
      }
      const canStop =
        interaction.member.voice.channelId === status.channelId ||
        interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        interaction.user.id === context.config.developerUserId;
      if (!canStop) {
        await interaction.reply({ content: "Entra al canal de la conversación para desconectarme.", flags: MessageFlags.Ephemeral });
        return;
      }
      await stopGeminiConversation(interaction.guild.id);
      await interaction.reply(`Conversación de Gemini Live finalizada por ${interaction.user}.`);
      return;
    }
    if (!context.config.geminiApiKey) {
      await interaction.reply({ content: "Gemini Live no está configurado. Falta `GEMINI_API_KEY` en el entorno del bot.", flags: MessageFlags.Ephemeral });
      return;
    }
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: "Primero entra a un canal de voz normal.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (status) {
      await interaction.reply({ content: `Ya estoy conversando en <#${status.channelId}>.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const botMember = interaction.guild.members.me;
    const permissions = botMember ? voiceChannel.permissionsFor(botMember) : null;
    if (!permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      await interaction.reply({ content: "Necesito los permisos **Connect** y **Speak** en ese canal.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    try {
      await startGeminiConversation({
        guild: interaction.guild,
        voiceChannel,
        announcementChannelId: interaction.channelId,
        apiKey: context.config.geminiApiKey,
        model: context.config.geminiLiveModel,
      });
    } catch (error: unknown) {
      const voiceUnavailable = error instanceof VoiceConnectionUnavailableError;
      await interaction.editReply({
        content: voiceUnavailable
          ? "No pude completar la conexión con el servidor de voz de Discord después de dos intentos. " +
            "Vuelve a probar en unos segundos o cambia de canal/región de voz."
          : "Pude entrar al canal, pero Gemini Live no consiguió iniciar la conversación. " +
            "La conexión de voz se cerró de forma segura; revisa el registro de errores e inténtalo nuevamente.",
      });
      void reportImportantError(
        interaction.client,
        error,
        voiceUnavailable ? "Conexión de voz de /hablar" : "Inicio de Gemini Live en /hablar",
        interaction.guild.id,
      );
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0x190c05)
      .setTitle("Nebu está escuchando")
      .setDescription(
        `Me conecté a ${voiceChannel}. Para hablar conmigo, incluyan mi nombre en cada intervención: **“Hey Nebu”**, **“Hola Nebu”** u **“Oye Nebu”**. Si no dicen **Nebu**, permaneceré en silencio.\n\n` +
          "El audio del canal se procesa temporalmente mediante **Google Gemini Live** y no se guarda en MongoDB ni Cloudinary. La sesión termina automáticamente después de 60 minutos.",
      )
      .addFields({ name: "Finalizar", value: "Usa `/hablar desconectar`." })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
