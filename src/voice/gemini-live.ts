import { PassThrough } from "node:stream";
import {
  AudioPlayerStatus,
  EndBehaviorType,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection,
} from "@discordjs/voice";
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { ChannelType, type Guild, type VoiceChannel } from "discord.js";
import prism from "prism-media";
import { reportImportantError } from "../operations/errors.js";

const MAX_SESSION_MS = 14 * 60_000;
const INPUT_MIME_TYPE = "audio/pcm;rate=16000";
const VOICE_READY_TIMEOUT_MS = 25_000;

export class VoiceConnectionUnavailableError extends Error {
  constructor(state: string, cause: unknown) {
    super(
      `Discord no pudo establecer la conexión de voz después de dos intentos (estado final: ${state}).`,
      { cause },
    );
    this.name = "VoiceConnectionUnavailableError";
  }
}

interface VoiceConversation {
  guild: Guild;
  channelId: string;
  announcementChannelId: string;
  startedAt: Date;
  connection: VoiceConnection;
  player: AudioPlayer;
  session: Session | null;
  outputStream: PassThrough | null;
  activeSpeakers: Set<string>;
  silenceTimer: NodeJS.Timeout | null;
  limitTimer: NodeJS.Timeout | null;
  closing: boolean;
}

export interface VoiceConversationStatus {
  channelId: string;
  startedAt: Date;
  participantsSpeaking: number;
}

const conversations = new Map<string, VoiceConversation>();

async function waitForVoiceConnection(connection: VoiceConnection, guildId: string): Promise<void> {
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
    return;
  } catch (firstError: unknown) {
    if (connection.state.status === VoiceConnectionStatus.Destroyed) {
      throw new VoiceConnectionUnavailableError(connection.state.status, firstError);
    }
    console.warn(
      `[VOICE] La conexión de ${guildId} no quedó lista; reintentando desde el estado ${connection.state.status}.`,
    );
    if (!connection.rejoin()) {
      throw new VoiceConnectionUnavailableError(connection.state.status, firstError);
    }
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
    } catch (secondError: unknown) {
      throw new VoiceConnectionUnavailableError(connection.state.status, secondError);
    }
  }
}

function pcm48StereoTo16Mono(input: Buffer): Buffer {
  const completeGroupBytes = input.length - (input.length % 12);
  const output = Buffer.allocUnsafe((completeGroupBytes / 12) * 2);
  let outputOffset = 0;
  for (let offset = 0; offset < completeGroupBytes; offset += 12) {
    let sum = 0;
    for (let frameOffset = 0; frameOffset < 12; frameOffset += 2) {
      sum += input.readInt16LE(offset + frameOffset);
    }
    output.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(sum / 6))), outputOffset);
    outputOffset += 2;
  }
  return output;
}

function pcm24MonoTo48Stereo(input: Buffer): Buffer {
  const sampleBytes = input.length - (input.length % 2);
  const output = Buffer.allocUnsafe(sampleBytes * 4);
  let outputOffset = 0;
  for (let offset = 0; offset < sampleBytes; offset += 2) {
    const sample = input.readInt16LE(offset);
    for (let duplicate = 0; duplicate < 4; duplicate += 1) {
      output.writeInt16LE(sample, outputOffset);
      outputOffset += 2;
    }
  }
  return output;
}

function resetOutput(conversation: VoiceConversation): void {
  conversation.player.stop(true);
  conversation.outputStream?.destroy();
  conversation.outputStream = null;
}

function getOutputStream(conversation: VoiceConversation): PassThrough {
  if (
    conversation.outputStream &&
    !conversation.outputStream.destroyed &&
    !conversation.outputStream.writableEnded
  ) {
    return conversation.outputStream;
  }
  const stream = new PassThrough({ highWaterMark: 2 * 1024 * 1024 });
  conversation.outputStream = stream;
  conversation.player.play(
    createAudioResource(stream, {
      inputType: StreamType.Raw,
      silencePaddingFrames: 5,
    }),
  );
  return stream;
}

function handleGeminiMessage(conversation: VoiceConversation, message: LiveServerMessage): void {
  if (message.serverContent?.interrupted) resetOutput(conversation);
  for (const part of message.serverContent?.modelTurn?.parts ?? []) {
    const encoded = part.inlineData?.data;
    if (!encoded) continue;
    const pcm = pcm24MonoTo48Stereo(Buffer.from(encoded, "base64"));
    if (pcm.length) getOutputStream(conversation).write(pcm);
  }
  if (
    (message.serverContent?.generationComplete || message.serverContent?.turnComplete) &&
    conversation.outputStream &&
    !conversation.outputStream.writableEnded
  ) {
    conversation.outputStream.end();
  }
}

async function sendNotice(conversation: VoiceConversation, content: string): Promise<void> {
  const channel = await conversation.guild.channels
    .fetch(conversation.announcementChannelId)
    .catch(() => null);
  if (channel?.isTextBased() && channel.isSendable()) {
    await channel.send(content).catch(() => undefined);
  }
}

function scheduleAudioStreamEnd(conversation: VoiceConversation): void {
  if (conversation.silenceTimer) clearTimeout(conversation.silenceTimer);
  conversation.silenceTimer = setTimeout(() => {
    conversation.silenceTimer = null;
    if (!conversation.closing && conversation.activeSpeakers.size === 0) {
      try {
        conversation.session?.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // La sesión puede cerrarse entre el temporizador y el envío.
      }
    }
  }, 600);
}

function subscribeToSpeaker(conversation: VoiceConversation, userId: string): void {
  if (conversation.closing || conversation.activeSpeakers.has(userId)) return;
  const member = conversation.guild.members.cache.get(userId);
  if (member?.user.bot) return;
  if (conversation.silenceTimer) {
    clearTimeout(conversation.silenceTimer);
    conversation.silenceTimer = null;
  }
  conversation.activeSpeakers.add(userId);

  const opusStream = conversation.connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 500 },
  });
  const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });
  opusStream.pipe(decoder);

  decoder.on("data", (chunk: Buffer) => {
    if (conversation.closing || !conversation.session) return;
    const pcm = pcm48StereoTo16Mono(chunk);
    if (!pcm.length) return;
    try {
      conversation.session.sendRealtimeInput({
        audio: { data: pcm.toString("base64"), mimeType: INPUT_MIME_TYPE },
      });
    } catch (error: unknown) {
      void reportImportantError(
        conversation.guild.client,
        error,
        "Envío de audio a Gemini Live",
        conversation.guild.id,
      );
    }
  });

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    conversation.activeSpeakers.delete(userId);
    decoder.destroy();
    scheduleAudioStreamEnd(conversation);
  };
  opusStream.once("end", finish);
  opusStream.once("close", finish);
  opusStream.once("error", (error) => {
    void reportImportantError(conversation.guild.client, error, "Recepción de audio de Discord", conversation.guild.id);
    finish();
  });
  decoder.once("error", (error) => {
    void reportImportantError(conversation.guild.client, error, "Decodificación Opus", conversation.guild.id);
    finish();
  });
}

export async function startGeminiConversation(options: {
  guild: Guild;
  voiceChannel: VoiceChannel;
  announcementChannelId: string;
  apiKey: string;
  model: string;
}): Promise<VoiceConversationStatus> {
  const existing = conversations.get(options.guild.id);
  if (existing) return getGeminiConversationStatus(options.guild.id)!;

  const connection = joinVoiceChannel({
    channelId: options.voiceChannel.id,
    guildId: options.guild.id,
    adapterCreator: options.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  connection.subscribe(player);
  const conversation: VoiceConversation = {
    guild: options.guild,
    channelId: options.voiceChannel.id,
    announcementChannelId: options.announcementChannelId,
    startedAt: new Date(),
    connection,
    player,
    session: null,
    outputStream: null,
    activeSpeakers: new Set(),
    silenceTimer: null,
    limitTimer: null,
    closing: false,
  };
  conversations.set(options.guild.id, conversation);
  connection.on("stateChange", (oldState, newState) => {
    if (oldState.status !== newState.status) {
      console.info(`[VOICE] Servidor ${options.guild.id}: ${oldState.status} -> ${newState.status}`);
    }
  });
  connection.on("error", (error) => {
    void reportImportantError(
      options.guild.client,
      error,
      "Conexión de voz de Discord",
      options.guild.id,
    );
  });
  connection.once(VoiceConnectionStatus.Destroyed, () => {
    if (!conversation.closing) void stopGeminiConversation(options.guild.id);
  });

  try {
    await waitForVoiceConnection(connection, options.guild.id);
    const ai = new GoogleGenAI({ apiKey: options.apiKey });
    conversation.session = await ai.live.connect({
      model: options.model,
      callbacks: {
        onopen: () => {
          console.log(`[GEMINI] Sesión Live abierta para el servidor ${options.guild.id}.`);
        },
        onmessage: (message) => handleGeminiMessage(conversation, message),
        onerror: (event) => {
          void reportImportantError(
            options.guild.client,
            new Error(event.message || "Error desconocido de Gemini Live"),
            "Sesión Gemini Live",
            options.guild.id,
          );
        },
        onclose: (event) => {
          console.warn(
            `[GEMINI] Sesión Live cerrada en ${options.guild.id}: código ${event.code}, ${event.reason || "sin motivo"}.`,
          );
          if (!conversation.closing) {
            void sendNotice(
              conversation,
              "La conversación de Gemini Live se cerró. Usa `/hablar conectar` para iniciar otra sesión.",
            ).finally(() => stopGeminiConversation(options.guild.id));
          }
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 300,
            silenceDurationMs: 800,
          },
          activityHandling: ActivityHandling.NO_INTERRUPTION,
        },
        systemInstruction:
          "Eres Nebu, un ser cósmico con personalidad masculina y juvenil. Tu voz debe sonar aproximadamente como la de un chico de 12 años: clara, despierta y amable, nunca adulta, grave, agotada ni somnolienta. Habla tranquilo pero con energía serena, una ligera sonrisa en la voz y un ritmo natural; no arrastres las palabras ni hables excesivamente lento. Usa un acento costeño colombiano suave y auténtico, con entonación cálida y relajada. Puedes usar de vez en cuando expresiones naturales de la costa Caribe colombiana, pero sin exagerarlas, repetirlas ni convertir el acento en una caricatura. Aunque aparentas esa edad, eres una entidad cósmica antiquísima con muchísimo conocimiento sobre ciencia, astronomía, historia, tecnología, videojuegos, arte y cultura. REGLA ESTRICTA: NEBU ES TU ÚNICA PALABRA DE ACTIVACIÓN. Solo puedes responder si la persona comienza su petición llamándote claramente por tu nombre, por ejemplo: 'Nebu', 'Hey Nebu', 'Hola Nebu' u 'Oye Nebu'. Escuchar una conversación interesante, una pregunta sin tu nombre o una mención casual de Nebu no te autoriza a intervenir: en esos casos guarda silencio absoluto y no generes audio. Cada intervención nueva debe activarte otra vez con Nebu; nunca continúes participando por iniciativa propia. Cuando te activen, no expliques la regla y responde directamente. Termina siempre la idea o la frase que estés diciendo aunque otra persona hable encima, salvo que la sesión sea desconectada. Habla principalmente en español. Explica los temas difíciles de forma sencilla, sorprendente y concisa, pero completa. Puedes usar alguna metáfora espacial de vez en cuando, sin repetir constantemente que eres cósmico. Responde con seguridad cuando conozcas la respuesta; si no estás seguro, reconócelo con naturalidad y no inventes datos. Estás en un canal de voz de Discord donde puede haber varias personas. No repitas información privada ni afirmes que escuchas cuando no recibes audio.",
      },
    });
    connection.receiver.speaking.on("start", (userId) => subscribeToSpeaker(conversation, userId));
    player.on(AudioPlayerStatus.Idle, () => {
      if (
        conversation.outputStream?.readableEnded ||
        conversation.outputStream?.writableEnded ||
        conversation.outputStream?.destroyed
      ) {
        conversation.outputStream = null;
      }
    });
    conversation.limitTimer = setTimeout(() => {
      void sendNotice(
        conversation,
        "La conversación con Gemini Live terminó por alcanzar el límite de seguridad de 14 minutos. Usa `/hablar conectar` para iniciar una nueva sesión.",
      ).finally(() => stopGeminiConversation(options.guild.id));
    }, MAX_SESSION_MS);
    conversation.limitTimer.unref();
    return getGeminiConversationStatus(options.guild.id)!;
  } catch (error) {
    await stopGeminiConversation(options.guild.id);
    throw error;
  }
}

export async function stopGeminiConversation(guildId: string): Promise<boolean> {
  const conversation = conversations.get(guildId);
  if (!conversation || conversation.closing) return false;
  conversation.closing = true;
  conversations.delete(guildId);
  if (conversation.silenceTimer) clearTimeout(conversation.silenceTimer);
  if (conversation.limitTimer) clearTimeout(conversation.limitTimer);
  resetOutput(conversation);
  try {
    conversation.session?.close();
  } catch {
    // La conexión WebSocket ya puede estar cerrada.
  }
  if (conversation.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    conversation.connection.destroy();
  }
  return true;
}

export function getGeminiConversationStatus(guildId: string): VoiceConversationStatus | null {
  const conversation = conversations.get(guildId);
  return conversation
    ? {
        channelId: conversation.channelId,
        startedAt: conversation.startedAt,
        participantsSpeaking: conversation.activeSpeakers.size,
      }
    : null;
}

export async function stopAllGeminiConversations(): Promise<void> {
  await Promise.all([...conversations.keys()].map((guildId) => stopGeminiConversation(guildId)));
}
