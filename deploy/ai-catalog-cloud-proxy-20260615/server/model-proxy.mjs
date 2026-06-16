const defaultMaxFrames = 50;
const defaultMaxChars = 30000;
const defaultTimeoutMs = 60000;

export function resolveManagedModelConfig(env = process.env) {
  const deepSeekApiKey = env.DEEPSEEK_API_KEY || '';
  const config = {
    provider: env.AGENT_MODEL_PROVIDER || (deepSeekApiKey ? 'DeepSeek' : 'Managed'),
    endpoint: env.AGENT_MODEL_ENDPOINT || env.MODEL_API_ENDPOINT || (deepSeekApiKey ? 'https://api.deepseek.com/v1' : ''),
    model: env.AGENT_MODEL_NAME || env.AGENT_MODEL || (deepSeekApiKey ? 'deepseek-chat' : ''),
    apiKey: env.AGENT_MODEL_API_KEY || env.MODEL_API_KEY || deepSeekApiKey,
  };
  return isCompleteModelConfig(config) ? config : null;
}

export function isCompleteModelConfig(config) {
  return Boolean(config?.endpoint && config?.model && config?.apiKey);
}

export function estimateTranslatePoints({ frames = [], translationRules = [] } = {}) {
  const characters = normalizeFrames(frames).reduce((total, frame) => total + frame.text.length, 0);
  const ruleWeight = Math.max(1, Array.isArray(translationRules) && translationRules.length ? translationRules.length : 1);
  return Math.max(1, Math.ceil((characters * ruleWeight) / 5000));
}

export function shouldTranslateTextForRules(text, translationRules = []) {
  const content = String(text || '');
  const rules = Array.isArray(translationRules) ? translationRules : [];
  if (!rules.length) return true;
  return rules.some((rule) => textMatchesSourceLanguage(content, rule.sourceLanguage || rule.source || ''));
}

function textMatchesSourceLanguage(text, sourceLanguage) {
  const language = String(sourceLanguage || '').trim().toLowerCase();
  if (!language || language.includes('auto')) return true;
  if (language.includes('all') || /[\u5168\u90e8\u6240\u6709]/.test(language)) return true;
  if (language.includes('chinese') || language.includes('mandarin') || /[\u4e2d\u6587\u6c49\u6f22\u7b80\u7c21\u7e41]/.test(language)) {
    return /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
  }
  if (language.includes('japanese') || /\u65e5\u672c|\u65e5\u8bed|\u65e5\u8a9e|\u65e5\u6587/.test(language)) {
    return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(text);
  }
  if (language.includes('korean') || /\u97e9\u8bed|\u97d3\u8a9e|\u671d\u9c9c/.test(language)) {
    return /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(text);
  }
  if (
    language.includes('english') ||
    language.includes('german') ||
    language.includes('french') ||
    language.includes('spanish') ||
    language.includes('italian') ||
    language.includes('portuguese')
  ) {
    return /[A-Za-z\u00c0-\u024f]/.test(text);
  }
  return true;
}

export function normalizeTranslationRules({ translationRules, sourceLang = 'Auto-detect from each text frame', targetLang = 'Simplified Chinese' } = {}) {
  if (Array.isArray(translationRules) && translationRules.length > 0) {
    return translationRules
      .map((rule) => ({
        sourceLanguage: String(rule.source || rule.sourceLanguage || '').trim(),
        targetLanguage: String(rule.target || rule.targetLanguage || '').trim(),
      }))
      .filter((rule) => rule.sourceLanguage && rule.targetLanguage);
  }
  return [{ sourceLanguage: sourceLang, targetLanguage: targetLang }];
}

export function normalizeChatCompletionsEndpoint(endpoint) {
  const trimmed = String(endpoint || '').replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export function buildModelTranslationRequest({ frames, modelConfig, glossary, sourceLang, targetLang, translationRules }) {
  const rules = normalizeTranslationRules({ translationRules, sourceLang, targetLang });
  return {
    endpoint: normalizeChatCompletionsEndpoint(modelConfig.endpoint),
    body: {
      model: modelConfig.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a professional catalog localization engine. Follow the provided translation rules as hard constraints. Translate only text segments that match a rule source language into that rule target language. If a frame or segment does not match any source-language rule, copy it exactly. Preserve numbers, model names, brand names, placeholders, non-source-language text, and line breaks. Return one translation for every input frame index. Return strict JSON only.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Translate Illustrator text frames.',
            sourceLanguage: sourceLang || 'Auto-detect from each text frame',
            targetLanguage: targetLang || 'Simplified Chinese',
            translationRules: rules,
            glossary: parseGlossary(glossary || ''),
            constraints: {
              nonMatchingFramePolicy: 'Return the original text unchanged for frames that do not match a source-language rule.',
              mixedLanguagePolicy: 'Translate only matching source-language segments and preserve every other segment exactly.',
              completeness: 'Include every input frame index in translations.',
            },
            outputSchema: { translations: [{ index: 0, translated: 'translated text' }] },
            frames: normalizeFrames(frames).map((frame) => ({ index: frame.index, text: frame.text })),
          }),
        },
      ],
    },
  };
}

export async function translateBatchWithManagedModel({ payload, modelConfig = resolveManagedModelConfig(), fetchImpl = fetch, env = process.env } = {}) {
  if (!isCompleteModelConfig(modelConfig)) {
    throw new Error('Managed model service is not configured.');
  }

  const frames = normalizeFrames(payload?.frames);
  assertWithinLimits(frames, env);
  const rules = normalizeTranslationRules({
    translationRules: payload?.translationRules || [],
    sourceLang: payload?.sourceLang || payload?.sourceLanguage || 'Auto-detect from each text frame',
    targetLang: payload?.targetLang || payload?.targetLanguage || 'Simplified Chinese',
  });
  const requestFrames = frames.filter((frame) => shouldTranslateTextForRules(frame.text, rules));
  if (requestFrames.length === 0) {
    return frames.map((frame) => ({
      index: frame.index,
      original: frame.text,
      translated: frame.text,
    }));
  }
  const request = buildModelTranslationRequest({
    frames: requestFrames,
    modelConfig,
    glossary: payload?.glossary || '',
    sourceLang: payload?.sourceLang || payload?.sourceLanguage || 'Auto-detect from each text frame',
    targetLang: payload?.targetLang || payload?.targetLanguage || 'Simplified Chinese',
    translationRules: rules,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.AGENT_MODEL_TIMEOUT_MS || defaultTimeoutMs));
  const response = await fetchImpl(request.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${modelConfig.apiKey}`,
    },
    body: JSON.stringify(request.body),
    signal: controller.signal,
  }).catch((error) => {
    if (error?.name === 'AbortError') {
      throw new Error('Managed model request timed out.');
    }
    throw error;
  }).finally(() => clearTimeout(timeout));

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Managed model request failed: HTTP ${response.status} ${trimForLog(responseText)}`);
  }
  if (!responseText.trim()) {
    throw new Error('Managed model returned an empty response.');
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Managed model returned invalid JSON: ${trimForLog(responseText)}`);
  }

  const content = data.choices?.[0]?.message?.content;
  const parsed = parseModelJsonContent(content);
  const byIndex = new Map(parsed.translations.map((item) => [Number(item.index), String(item.translated || '')]));
  return frames.map((frame) => ({
    index: frame.index,
    original: frame.text,
    translated: byIndex.get(Number(frame.index)) || frame.text,
  }));
}

export function parseModelJsonContent(content) {
  const raw = String(content || '').trim();
  const withoutFence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!withoutFence) throw new Error('Managed model returned empty content.');
  const parsed = JSON.parse(withoutFence);
  if (!Array.isArray(parsed.translations)) {
    throw new Error('Managed model response missing translations array.');
  }
  return parsed;
}

export function normalizeFrames(frames = []) {
  if (!Array.isArray(frames)) return [];
  return frames
    .map((frame) => ({
      index: Number(frame.index),
      text: String(frame.text || ''),
    }))
    .filter((frame) => Number.isFinite(frame.index) && frame.text);
}

function assertWithinLimits(frames, env) {
  if (frames.length === 0) throw new Error('No text frames to translate.');
  const maxFrames = Number(env.AGENT_TRANSLATE_MAX_FRAMES || defaultMaxFrames);
  const maxChars = Number(env.AGENT_TRANSLATE_MAX_CHARS || defaultMaxChars);
  const chars = frames.reduce((total, frame) => total + frame.text.length, 0);
  if (frames.length > maxFrames) throw new Error(`Too many frames in one translate request: ${frames.length}/${maxFrames}.`);
  if (chars > maxChars) throw new Error(`Too many characters in one translate request: ${chars}/${maxChars}.`);
}

function parseGlossary(glossary = '') {
  return String(glossary || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [source, target] = line.includes('=') ? line.split('=').map((item) => item.trim()) : [line, line];
      return { source, target: target || source };
    })
    .filter((item) => item.source);
}

function trimForLog(value, maxLength = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
