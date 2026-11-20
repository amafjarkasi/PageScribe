import { summarizeContent, type SummaryFormat, type SummaryLength } from './content';

export type AIProvider = 'offline' | 'chrome-ai' | 'openai-compatible';

export interface AIConfig {
  provider: AIProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'offline',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
};

interface ChromeLanguageModelSession {
  prompt: (text: string) => Promise<string>;
  destroy?: () => void;
}

async function runChromeBuiltInAI(promptText: string): Promise<string | null> {
  const g = globalThis as unknown as {
    LanguageModel?: {
      availability?: () => Promise<string>;
      create?: () => Promise<ChromeLanguageModelSession>;
    };
    ai?: {
      languageModel?: {
        capabilities?: () => Promise<{ available: string }>;
        create?: () => Promise<ChromeLanguageModelSession>;
      };
    };
  };

  try {
    if (g.LanguageModel?.create) {
      const status = g.LanguageModel.availability ? await g.LanguageModel.availability() : 'available';
      if (status === 'unavailable') return null;
      const session = await g.LanguageModel.create();
      try {
        return await session.prompt(promptText);
      } finally {
        session.destroy?.();
      }
    }

    if (g.ai?.languageModel?.create) {
      const session = await g.ai.languageModel.create();
      try {
        return await session.prompt(promptText);
      } finally {
        session.destroy?.();
      }
    }
  } catch (err) {
    console.warn('Chrome built-in AI failed, falling back:', err);
  }
  return null;
}

async function callOpenAICompatible(
  systemPrompt: string,
  userPrompt: string,
  config: AIConfig
): Promise<string> {
  if (!config.apiKey?.trim()) {
    throw new Error('API key is required for OpenAI-compatible provider.');
  }
  const endpoint = config.apiUrl?.trim() || DEFAULT_AI_CONFIG.apiUrl;
  const model = config.model?.trim() || DEFAULT_AI_CONFIG.model;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI API error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI API returned an empty response.');
  }
  return String(content).trim();
}

export async function summarizeWithAI(
  content: string,
  length: SummaryLength,
  format: SummaryFormat,
  config: AIConfig
): Promise<{ result: string; usedProvider: AIProvider }> {
  const truncated = (content || '').slice(0, 24000);

  if (config.provider === 'chrome-ai') {
    const style = format === 'bullets' ? 'concise bullet points' : 'a clear paragraph';
    const prompt = `Summarize the following content in ${length} length as ${style}:\n\n${truncated}`;
    const aiResult = await runChromeBuiltInAI(prompt);
    if (aiResult) {
      return { result: aiResult, usedProvider: 'chrome-ai' };
    }
  } else if (config.provider === 'openai-compatible') {
    const style = format === 'bullets' ? 'concise markdown bullet points' : 'clear prose paragraphs';
    const systemPrompt = 'You are a concise, accurate technical summarizer.';
    const userPrompt = `Summarize the following content (${length} length, formatted as ${style}):\n\n${truncated}`;
    const result = await callOpenAICompatible(systemPrompt, userPrompt, config);
    return { result, usedProvider: 'openai-compatible' };
  }

  return {
    result: summarizeContent(content, length, format),
    usedProvider: 'offline',
  };
}

export async function askWithAI(
  question: string,
  context: string,
  config: AIConfig
): Promise<{ answer: string; usedProvider: AIProvider }> {
  if (!question?.trim()) {
    throw new Error('Please enter a question.');
  }

  const truncated = (context || '').slice(0, 24000);

  if (config.provider === 'chrome-ai') {
    const prompt = `Answer the question based strictly on the provided context.\n\nContext:\n${truncated}\n\nQuestion: ${question}`;
    const aiResult = await runChromeBuiltInAI(prompt);
    if (aiResult) {
      return { answer: aiResult, usedProvider: 'chrome-ai' };
    }
    throw new Error('Chrome built-in AI is unavailable in this browser. Configure an OpenAI-compatible API key in AI Settings.');
  }

  if (config.provider === 'openai-compatible') {
    const answer = await callOpenAICompatible(
      'Answer the user question based strictly on the provided page/PDF content. Be concise and accurate.',
      `Context:\n${truncated}\n\nQuestion: ${question}`,
      config
    );
    return { answer, usedProvider: 'openai-compatible' };
  }

  // Offline fallback: keyword-based relevant sentence extraction
  const qTerms = new Set(
    question
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );
  const sentences = (context || '').match(/[^.!?\n]+[.!?\n]+/g) || [];
  const scored = sentences
    .map((s) => {
      const words = s.toLowerCase().split(/\W+/);
      let hits = 0;
      for (const w of words) {
        if (qTerms.has(w)) hits++;
      }
      return { s: s.trim(), hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((x) => x.s);

  if (scored.length === 0) {
    return {
      answer: 'No matching passages found offline. Enable Chrome AI or an OpenAI-compatible API key in AI Settings for full Q&A.',
      usedProvider: 'offline',
    };
  }

  return {
    answer: `Relevant excerpts (offline match):\n\n${scored.map((s) => `- ${s}`).join('\n')}`,
    usedProvider: 'offline',
  };
}
