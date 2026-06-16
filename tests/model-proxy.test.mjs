import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelTranslationRequest,
  estimateTranslatePoints,
  resolveManagedModelConfig,
  shouldTranslateTextForRules,
  translateBatchWithManagedModel,
} from '../server/model-proxy.mjs';

test('resolveManagedModelConfig reads managed DeepSeek environment', () => {
  const config = resolveManagedModelConfig({
    AGENT_MODEL_PROVIDER: 'DeepSeek',
    AGENT_MODEL_ENDPOINT: 'https://api.deepseek.com/v1',
    AGENT_MODEL_NAME: 'deepseek-chat',
    AGENT_MODEL_API_KEY: 'secret-key',
  });

  assert.deepEqual(config, {
    provider: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'secret-key',
  });
});

test('estimateTranslatePoints scales with characters and rules', () => {
  const points = estimateTranslatePoints({
    frames: [{ index: 1, text: 'a'.repeat(6000) }],
    translationRules: [
      { source: 'Chinese', target: 'Japanese' },
      { source: 'English', target: 'German' },
    ],
  });

  assert.equal(points, 3);
});

test('shouldTranslateTextForRules keeps non-source-language text out of model requests', () => {
  const rules = [{ source: 'Simplified Chinese', target: 'German' }];

  assert.equal(shouldTranslateTextForRules('Serve Customers', rules), false);
  assert.equal(shouldTranslateTextForRules('\u751f\u4ea7\u7ebf Production line', rules), true);
});

test('buildModelTranslationRequest creates OpenAI-compatible request', () => {
  const request = buildModelTranslationRequest({
    frames: [{ index: 2, text: 'Production line' }],
    modelConfig: {
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
    glossary: 'NDI = NDI',
    sourceLang: 'English',
    targetLang: 'Japanese',
    translationRules: [{ source: 'English', target: 'Japanese' }],
  });
  const userPayload = JSON.parse(request.body.messages[1].content);

  assert.equal(request.endpoint, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(request.body.model, 'deepseek-chat');
  assert.equal(userPayload.frames[0].text, 'Production line');
  assert.deepEqual(userPayload.translationRules, [{ sourceLanguage: 'English', targetLanguage: 'Japanese' }]);
});

test('translateBatchWithManagedModel preserves frames outside source-language rules', async () => {
  let userPayload = null;
  const translations = await translateBatchWithManagedModel({
    payload: {
      frames: [
        { index: 1, text: 'Serve Customers' },
        { index: 2, text: '\u751f\u4ea7\u7ebf Production line' },
      ],
      sourceLang: 'Simplified Chinese',
      targetLang: 'German',
      translationRules: [{ source: 'Simplified Chinese', target: 'German' }],
    },
    modelConfig: {
      provider: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'server-secret',
    },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init.body || '{}'));
      userPayload = JSON.parse(body.messages[1].content);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"translations":[{"index":2,"translated":"Produktionslinie Production line"}]}' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
    env: {
      AGENT_MODEL_TIMEOUT_MS: '1000',
    },
  });

  assert.deepEqual(userPayload.frames, [{ index: 2, text: '\u751f\u4ea7\u7ebf Production line' }]);
  assert.equal(translations[0].translated, 'Serve Customers');
  assert.equal(translations[1].translated, 'Produktionslinie Production line');
});

test('translateBatchWithManagedModel calls provider with server-side api key', async () => {
  let requestUrl = '';
  let requestInit = null;
  const translations = await translateBatchWithManagedModel({
    payload: {
      frames: [{ index: 5, text: 'Hello' }],
      sourceLang: 'English',
      targetLang: 'Japanese',
    },
    modelConfig: {
      provider: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'server-secret',
    },
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"translations":[{"index":5,"translated":"こんにちは"}]}' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
    env: {
      AGENT_MODEL_TIMEOUT_MS: '1000',
    },
  });

  assert.equal(requestUrl, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(requestInit.headers.authorization, 'Bearer server-secret');
  assert.equal(translations[0].translated, 'こんにちは');
});
