// ─────────────────────────────────────────────
// AI Provider Abstraction Layer
// Supports: Claude (Anthropic) + GPT (OpenAI)
// ─────────────────────────────────────────────

export const PROVIDERS = {
  claude: {
    id: "claude",
    name: "Claude (Anthropic)",
    placeholder: "sk-ant-api03-...",
    model: "claude-sonnet-4-20250514",
    keyPrefix: "sk-ant-",
  },
  openai: {
    id: "openai",
    name: "GPT-4o (OpenAI)",
    placeholder: "sk-proj-...",
    model: "gpt-4o",
    keyPrefix: "sk-",
  },
};

export async function callAI({ provider, apiKey, systemPrompt, userPrompt, maxTokens = 2048 }) {
  if (provider === "claude") {
    return callClaude({ apiKey, systemPrompt, userPrompt, maxTokens });
  } else if (provider === "openai") {
    return callOpenAI({ apiKey, systemPrompt, userPrompt, maxTokens });
  }
  throw new Error(`Unknown provider: ${provider}`);
}

async function callClaude({ apiKey, systemPrompt, userPrompt, maxTokens }) {
  const resp = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.content?.map((c) => c.text || "").join("\n") || "";
  const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  return { text, tokens };
}

async function callOpenAI({ apiKey, systemPrompt, userPrompt, maxTokens }) {
  const resp = await fetch("/api/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      model: "gpt-4o",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || "";
  const tokens = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  return { text, tokens };
}

export async function validateKey(provider, apiKey) {
  try {
    if (provider === "claude") {
      const resp = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          model: "claude-sonnet-4-20250514",
          max_tokens: 10,
          messages: [{ role: "user", content: "Reply OK" }],
        }),
      });
      return resp.ok;
    } else if (provider === "openai") {
      const resp = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          model: "gpt-4o",
          max_tokens: 10,
          messages: [
            { role: "system", content: "Reply OK" },
            { role: "user", content: "test" },
          ],
        }),
      });
      return resp.ok;
    }
    return false;
  } catch {
    return false;
  }
}

export function parseJSON(raw) {
  try {
    return JSON.parse((raw || "").replace(/```json\s*|```\s*/g, "").trim());
  } catch {
    return null;
  }
}
