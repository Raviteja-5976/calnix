import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { z } from "zod";
import { shrinkImage } from "./shrink";

/**
 * Runware serves text models through an OpenAI-compatible endpoint, so text
 * uses the OpenAI SDK pointed at Runware. Images use Runware's own task API.
 */
const BASE_URL = "https://api.runware.ai/v1";
export const TEXT_MODEL = process.env.RUNWARE_TEXT_MODEL || "deepseek:v4@flash";
export const IMAGE_MODEL = process.env.RUNWARE_IMAGE_MODEL || "runware:100@1";

/** A failure whose message is safe to show to the person who asked. */
export class AiFailure extends Error {}

function apiKey() {
  const key = process.env.RUNWARE_API_KEY;
  if (!key) throw new AiFailure("AI is not set up yet: RUNWARE_API_KEY is missing.");
  return key;
}

function textClient() {
  return new OpenAI({ apiKey: apiKey(), baseURL: BASE_URL, timeout: 60_000, maxRetries: 1 });
}

type Message = { role: "system" | "user" | "assistant"; content: string };

async function complete(messages: Message[], maxTokens: number, json: boolean): Promise<string> {
  const client = textClient();
  const base = { model: TEXT_MODEL, messages, max_tokens: maxTokens, temperature: 0.4 };
  let response;
  try {
    response = await client.chat.completions.create(
      json ? { ...base, response_format: { type: "json_object" } } : base,
    );
  } catch (error) {
    // Some models refuse response_format; the prompt still asks for JSON.
    if (json && error instanceof OpenAI.BadRequestError) {
      response = await client.chat.completions.create(base);
    } else {
      throw error;
    }
  }
  const choice = response.choices[0];
  const text = choice?.message?.content?.trim();
  if (!text) throw new AiFailure("The AI returned an empty answer. Try again.");
  if (choice.finish_reason === "length" && json) {
    throw new AiFailure("The AI answer was too long and got cut off. Try a shorter request.");
  }
  return text;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in the reply");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Asks for a JSON object matching `schema`. A reply that is not valid JSON or
 * has the wrong shape gets one correction round before giving up.
 */
export async function generateJson<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  maxTokens = 1500,
): Promise<T> {
  const messages: Message[] = [
    { role: "system", content: `${system}\n\nReply with a single JSON object and nothing else.` },
    { role: "user", content: user },
  ];
  let reply = await complete(messages, maxTokens, true);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = schema.safeParse(extractJson(reply));
      if (parsed.success) return parsed.data;
      if (attempt === 1) break;
      messages.push(
        { role: "assistant", content: reply },
        {
          role: "user",
          content: `That JSON does not match the required shape: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
            .join("; ")}. Reply again with corrected JSON only.`,
        },
      );
    } catch {
      if (attempt === 1) break;
      messages.push(
        { role: "assistant", content: reply },
        { role: "user", content: "That was not valid JSON. Reply again with one JSON object only." },
      );
    }
    reply = await complete(messages, maxTokens, true);
  }
  throw new AiFailure("The AI answer could not be understood. Try again.");
}

/** Free-form text, such as Markdown for a doc. */
export async function generateText(system: string, user: string, maxTokens = 2000): Promise<string> {
  const text = await complete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens,
    false,
  );
  // Models sometimes wrap a whole Markdown answer in a code fence.
  const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (fenced ? fenced[1] : text).trim();
}

interface RunwareResult {
  data?: { imageURL?: string; taskUUID?: string }[];
  errors?: { code?: string; message?: string }[];
}

class RunwareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Generates one image and returns it as WebP under 250 KB. */
export async function generateImage(
  prompt: string,
  size: { width: number; height: number } = { width: 1024, height: 576 },
): Promise<Buffer> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        taskType: "imageInference",
        taskUUID: randomUUID(),
        positivePrompt: prompt.slice(0, 2000),
        model: IMAGE_MODEL,
        width: size.width,
        height: size.height,
        steps: 4,
        numberResults: 1,
        outputType: "URL",
        outputFormat: "WEBP",
        outputQuality: 80,
      },
    ]),
    signal: AbortSignal.timeout(90_000),
  });
  const result = (await response.json().catch(() => ({}))) as RunwareResult;
  const failure = result.errors?.[0];
  if (!response.ok || failure) {
    throw new RunwareError(failure?.message ?? `Runware returned ${response.status}`, response.status, failure?.code);
  }
  const url = result.data?.[0]?.imageURL;
  if (!url) throw new AiFailure("The AI returned no image. Try again.");

  const image = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!image.ok) throw new AiFailure("Could not download the generated image. Try again.");
  return shrinkImage(Buffer.from(await image.arrayBuffer()));
}

/** Turns any AI error into a message that is safe and useful to show. */
export function publicAiError(error: unknown): string {
  if (error instanceof AiFailure) return error.message;
  const status =
    error instanceof RunwareError ? error.status : error instanceof OpenAI.APIError ? error.status : undefined;
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (status === 401 || status === 403 || /api.?key|unauthori[sz]ed|authentication/.test(text)) {
    return "The Runware API key is missing or invalid.";
  }
  if (status === 402 || /insufficient|credit|balance|payment/.test(text)) {
    return "The Runware account is out of credit. Top it up and try again.";
  }
  if (status === 429) return "The AI service is busy. Try again in a moment.";
  if (/nsfw|safety|moderat|content.?policy/.test(text)) {
    return "The AI safety filter blocked this request. Rephrase it and try again.";
  }
  if (error instanceof OpenAI.APIConnectionError || (error instanceof Error && error.name === "TimeoutError")) {
    return "Could not reach the AI service. Try again.";
  }
  return "The AI request failed. Try again.";
}
