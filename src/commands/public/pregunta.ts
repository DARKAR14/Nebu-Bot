import { GoogleGenAI } from "@google/genai";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.js";

const systemInstruction =
  "Eres Nebu, un ser cósmico antiquísimo de personalidad juvenil, curiosa y amable. " +
  "Responde en español con un tono cálido y relajado del Caribe colombiano. " +
  "Usa expresiones costeñas de vez en cuando, con naturalidad y sin exagerarlas. " +
  "Ve directo a la pregunta y explica los temas difíciles con claridad y brevedad. " +
  "Puedes usar alguna metáfora espacial. Si no sabes algo, dilo sin inventar datos. " +
  "Estás respondiendo por escrito en Discord. Procura usar menos de 1800 caracteres.";

export const preguntaCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("pregunta")
    .setDescription("Hazle una pregunta a Nebu y recibe su respuesta en el chat.")
    .addStringOption((option) =>
      option
        .setName("texto")
        .setDescription("¿Qué quieres preguntarle a Nebu?")
        .setRequired(true)
        .setMaxLength(1000),
    ),
  async execute(interaction, { config }) {
    const question = interaction.options.getString("texto", true).trim();
    if (!question || !config.geminiApiKey) {
      await interaction.reply({
        content: question
          ? "Todavía no tengo Gemini configurado para responderte."
          : "Escríbeme una pregunta y te cuento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    let answer: string | undefined;
    try {
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: question,
        config: {
          systemInstruction,
          maxOutputTokens: 1024,
          httpOptions: { timeout: 20_000 },
        },
      });
      answer = response.text?.trim();
    } catch {
      answer = "Uy, se me cruzó un cable con Gemini. Intenta de nuevo en un ratico.";
    }

    await interaction.editReply({
      content: answer ? answer.slice(0, 2000) : "Eche, no encontré cómo responderte. Prueba reformulando la pregunta.",
      allowedMentions: { parse: [] },
    });
  },
};
