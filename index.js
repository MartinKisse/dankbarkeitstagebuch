import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function run() {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream("audio.m4a"),
    model: "gpt-4o-transcribe",
  });

  const text = transcription.text;

  const summary = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Fasse den Text in kurze Stichpunkte für ein Dankbarkeitstagebuch zusammen.",
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  console.log(summary.choices[0].message.content);
}

run();