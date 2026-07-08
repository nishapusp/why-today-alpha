const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiCallOptions {
  maxOutputTokens?: number;
}

/**
 * Calls the Gemini API with Google Search grounding enabled — this is
 * what replaced the Copilot Studio agent. One HTTP call, no conversation
 * state, no "which format would you like" back-and-forth.
 *
 * Note: Gemini's API does not currently support combining tool use
 * (Google Search here) with forced JSON response mode — that combination
 * returns a 400 error. So callers that need JSON must request it via the
 * prompt itself and parse the text response, not via responseMimeType.
 */
export async function generateWithGemini(
  systemInstruction: string,
  userPrompt: string,
  apiKey: string,
  options: GeminiCallOptions = {}
): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 8192,
    },
  };

  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];

  if (!candidate) {
    throw new Error(`Gemini returned no candidates: ${JSON.stringify(data)}`);
  }
  if (candidate.finishReason === "MAX_TOKENS") {
    throw new Error(
      "Gemini response was cut off (hit maxOutputTokens). Try again with fewer stories or raise maxOutputTokens."
    );
  }

  const text = candidate.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
  if (!text) {
    throw new Error(`Gemini returned an empty response: ${JSON.stringify(data)}`);
  }
  return text;
}
