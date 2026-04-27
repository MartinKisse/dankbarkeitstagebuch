import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function run() {
  // 1. Audio → Text
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream("audio.m4a"),
    model: "gpt-4o-transcribe",
  });

  const text = transcription.text;

  console.log("Transkription:");
  console.log(text);

  // 2. Text → Stichpunkte
  const summary = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Fasse den Text in kurze, klare Stichpunkte für ein Dankbarkeitstagebuch zusammen.",
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  console.log("\nStichpunkte:");
  console.log(summary.choices[0].message.content);
}

run();