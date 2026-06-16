import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildApplyJsx,
  buildExtractJsx,
  buildTranslationRequest,
  buildTranslationsPayload,
  estimateTranslationPointsForFrames,
  normalizeChatCompletionsEndpoint,
  normalizeTranslationRules,
  parseModelJsonContent,
  parseGlossary,
  resolveOutputDirectory,
  shouldTranslateTextForRules,
  translateFrames,
  toJsString,
} from '../scripts/agent-core.mjs';

test('toJsString normalizes Windows paths for JSX', () => {
  assert.equal(toJsString('C:\\Users\\Admin\\Desktop\\a.ai'), 'C:/Users/Admin/Desktop/a.ai');
});

test('parseGlossary converts line pairs', () => {
  assert.deepEqual(parseGlossary('HDMI = HDMI\nNDI=NDI\nKiloview'), [
    { source: 'HDMI', target: 'HDMI' },
    { source: 'NDI', target: 'NDI' },
    { source: 'Kiloview', target: 'Kiloview' },
  ]);
});

test('normalizes OpenAI compatible chat completion endpoints', () => {
  assert.equal(normalizeChatCompletionsEndpoint('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
  assert.equal(
    normalizeChatCompletionsEndpoint('https://api.example.com/v1/chat/completions'),
    'https://api.example.com/v1/chat/completions',
  );
});

test('buildTranslationRequest creates strict JSON chat request', () => {
  const request = buildTranslationRequest({
    frames: [{ index: 3, text: 'Professional video encoder' }],
    glossary: 'HDMI = HDMI',
    sourceLang: 'English',
    targetLang: 'Simplified Chinese',
    modelConfig: {
      endpoint: 'https://api.example.com/v1',
      model: 'qwen-plus',
    },
  });

  assert.equal(request.endpoint, 'https://api.example.com/v1/chat/completions');
  assert.equal(request.body.model, 'qwen-plus');
  assert.equal(request.body.response_format.type, 'json_object');
  assert.match(request.body.messages[1].content, /Professional video encoder/);
});

test('buildTranslationRequest defaults to automatic source-language detection', () => {
  const request = buildTranslationRequest({
    frames: [{ index: 7, text: 'Production line' }],
    glossary: '',
    targetLang: 'Traditional Chinese',
    modelConfig: {
      endpoint: 'https://api.example.com/v1',
      model: 'qwen-plus',
    },
  });
  const userPayload = JSON.parse(request.body.messages[1].content);

  assert.equal(userPayload.sourceLanguage, 'Auto-detect from each text frame');
  assert.equal(userPayload.targetLanguage, 'Traditional Chinese');
  assert.deepEqual(userPayload.translationRules, [
    { sourceLanguage: 'Auto-detect from each text frame', targetLanguage: 'Traditional Chinese' },
  ]);
});

test('buildTranslationRequest includes independent translation rules', () => {
  const request = buildTranslationRequest({
    frames: [{ index: 9, text: '生产线 Production line' }],
    glossary: '',
    translationRules: [
      { source: '简体中文', target: '日语' },
      { source: '英文', target: '德语' },
    ],
    modelConfig: {
      endpoint: 'https://api.example.com/v1',
      model: 'qwen-plus',
    },
  });
  const userPayload = JSON.parse(request.body.messages[1].content);

  assert.deepEqual(userPayload.translationRules, [
    { sourceLanguage: '简体中文', targetLanguage: '日语' },
    { sourceLanguage: '英文', targetLanguage: '德语' },
  ]);
  assert.match(request.body.messages[0].content, /hard constraints/);
  assert.match(request.body.messages[0].content, /copy it exactly/);
});

test('normalizeTranslationRules falls back to legacy source and target language', () => {
  assert.deepEqual(normalizeTranslationRules({ sourceLang: 'English', targetLang: '简体中文' }), [
    { sourceLanguage: 'English', targetLanguage: '简体中文' },
  ]);
});

test('estimateTranslationPointsForFrames keeps one cloud task charge across batches', () => {
  const points = estimateTranslationPointsForFrames({
    frames: [
      { index: 1, text: 'a'.repeat(3200) },
      { index: 2, text: 'b'.repeat(3200) },
    ],
    translationRules: [
      { source: 'Chinese', target: 'Japanese' },
      { source: 'English', target: 'German' },
    ],
    fallbackPoints: 1,
  });

  assert.equal(points, 3);
});

test('shouldTranslateTextForRules skips non-source-language frames', () => {
  const rules = [{ source: 'Simplified Chinese', target: 'German' }];

  assert.equal(shouldTranslateTextForRules('Serve Customers', rules), false);
  assert.equal(shouldTranslateTextForRules('\u751f\u4ea7\u7ebf Production line', rules), true);
});

test('buildTranslationsPayload emits Illustrator-readable payload', () => {
  const payload = buildTranslationsPayload([{ index: 2, original: 'Hello', translated: '你好' }]);
  assert.match(payload, /frameTranslations/);
  assert.match(payload, /index: 2/);
  assert.match(payload, /"你好"/);
});

test('parseModelJsonContent accepts raw and fenced JSON', () => {
  assert.deepEqual(parseModelJsonContent('{"translations":[{"index":1,"translated":"你好"}]}'), {
    translations: [{ index: 1, translated: '你好' }],
  });
  assert.deepEqual(parseModelJsonContent('```json\n{"translations":[]}\n```'), { translations: [] });
});

test('build JSX scripts include configured paths', () => {
  const extract = buildExtractJsx({
    sourceCopyPath: 'C:/tmp/source.ai',
    extractedJsonPath: 'C:/tmp/extracted.json',
  });
  const apply = buildApplyJsx({
    sourceCopyPath: 'C:/tmp/source.ai',
    payloadJsxPath: 'C:/tmp/payload.jsx',
    outputAiPath: 'C:/tmp/output.ai',
    reportPath: 'C:/tmp/report.json',
  });

  assert.match(extract, /C:\/tmp\/source.ai/);
  assert.match(extract, /C:\/tmp\/extracted.json/);
  assert.match(extract, /hasTranslatableText/);
  assert.doesNotMatch(extract, /hasLatinText/);
  assert.match(apply, /C:\/tmp\/output.ai/);
  assert.match(apply, /MicrosoftYaHei/);
  assert.match(apply, /DONTDISPLAYALERTS/);
});

test('build apply JSX can prefer a user supplied font', () => {
  const apply = buildApplyJsx({
    sourceCopyPath: 'C:/tmp/source.ai',
    payloadJsxPath: 'C:/tmp/payload.jsx',
    outputAiPath: 'C:/tmp/output.ai',
    reportPath: 'C:/tmp/report.json',
    customFont: {
      candidates: ['BrandFont', 'Brand Font'],
    },
  });

  assert.match(apply, /BrandFont/);
  assert.match(apply, /requestedFont/);
  assert.doesNotMatch(apply, /MicrosoftYaHei/);
});

test('resolveOutputDirectory supports source folder and custom folder', () => {
  assert.match(
    resolveOutputDirectory({
      sourcePath: 'C:/Users/Admin/Desktop/source.ai',
      outputLocation: '源文件同目录',
    }),
    /Desktop$/,
  );
  assert.equal(
    resolveOutputDirectory({
      sourcePath: 'C:/Users/Admin/Desktop/source.ai',
      outputLocation: '自定义路径',
      outputCustomPath: 'D:/Translated',
    }).replace(/\\/g, '/'),
    'D:/Translated',
  );
});

test('translateFrames reports empty model responses clearly', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  await assert.rejects(
    () =>
      translateFrames({
        frames: [{ index: 1, text: 'Hello' }],
        modelConfig: {
          endpoint: 'https://api.example.com/v1',
          model: 'test-model',
          apiKey: 'test-key',
        },
        glossary: '',
        sourceLang: 'English',
        targetLang: '简体中文',
      }),
    /模型服务返回空响应/,
  );

  globalThis.fetch = originalFetch;
});

test('translateFrames reports model request timeout clearly', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

  await assert.rejects(
    () =>
      translateFrames({
        frames: [{ index: 1, text: 'Hello' }],
        modelConfig: {
          endpoint: 'https://api.example.com/v1',
          model: 'test-model',
          apiKey: 'test-key',
        },
        glossary: '',
        sourceLang: 'English',
        targetLang: '简体中文',
        timeoutMs: 1,
      }),
    /模型服务请求超时/,
  );

  globalThis.fetch = originalFetch;
});

test('translateFrames retries transient model failures', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('', { status: 502 });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"translations":[{"index":1,"translated":"你好"}]}' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const translations = await translateFrames({
    frames: [{ index: 1, text: 'Hello' }],
    modelConfig: {
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      apiKey: 'test-key',
    },
    glossary: '',
    sourceLang: 'English',
    targetLang: '简体中文',
    retryDelayMs: 1,
  });

  assert.equal(calls, 2);
  assert.equal(translations[0].translated, '你好');
  globalThis.fetch = originalFetch;
});

test('translateFrames uses cloud proxy without model authorization header', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit = null;
  let requestPayload = null;
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    requestPayload = JSON.parse(String(init.body || '{}'));
    return new Response(
      JSON.stringify({
        ok: true,
        translations: [{ index: 4, translated: 'クラウド翻訳' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const translations = await translateFrames({
    frames: [{ index: 4, text: 'Cloud translation' }],
    modelConfig: {
      mode: 'cloud-proxy',
      provider: 'AI Catalog Cloud',
      endpoint: 'http://127.0.0.1:8787/api/translate/batch',
      model: 'cloud-managed',
      licenseToken: 'license-token',
      activationCode: 'ACTIVATION-CODE',
      deviceId: 'device-a',
      taskId: 'task-cloud',
      points: 3,
    },
    glossary: 'NDI = NDI',
    sourceLang: 'English',
    targetLang: 'Japanese',
    retryDelayMs: 1,
  });

  assert.equal(requestUrl, 'http://127.0.0.1:8787/api/translate/batch');
  assert.equal(requestInit.headers.authorization, undefined);
  assert.equal(requestPayload.licenseToken, 'license-token');
  assert.equal(requestPayload.activationCode, 'ACTIVATION-CODE');
  assert.equal(requestPayload.deviceId, 'device-a');
  assert.equal(requestPayload.taskId, 'task-cloud');
  assert.equal(requestPayload.points, 3);
  assert.deepEqual(requestPayload.frames, [{ index: 4, text: 'Cloud translation' }]);
  assert.equal(translations[0].translated, 'クラウド翻訳');
  globalThis.fetch = originalFetch;
});

test('translateFrames leaves nonmatching frames unchanged before cloud proxy', async () => {
  const originalFetch = globalThis.fetch;
  let requestPayload = null;
  globalThis.fetch = async (_url, init) => {
    requestPayload = JSON.parse(String(init.body || '{}'));
    return new Response(
      JSON.stringify({
        ok: true,
        translations: [{ index: 2, translated: 'Produktionslinie Production line' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const translations = await translateFrames({
    frames: [
      { index: 1, text: 'Serve Customers' },
      { index: 2, text: '\u751f\u4ea7\u7ebf Production line' },
    ],
    modelConfig: {
      mode: 'cloud-proxy',
      provider: 'AI Catalog Cloud',
      endpoint: 'http://127.0.0.1:8787/api/translate/batch',
      model: 'cloud-managed',
      licenseToken: 'license-token',
      activationCode: 'ACTIVATION-CODE',
      deviceId: 'device-a',
      taskId: 'task-cloud',
      points: 1,
    },
    glossary: '',
    sourceLang: 'Simplified Chinese',
    targetLang: 'German',
    translationRules: [{ source: 'Simplified Chinese', target: 'German' }],
    retryDelayMs: 1,
  });

  assert.deepEqual(requestPayload.frames, [{ index: 2, text: '\u751f\u4ea7\u7ebf Production line' }]);
  assert.equal(translations[0].translated, 'Serve Customers');
  assert.equal(translations[1].translated, 'Produktionslinie Production line');
  assert.equal(translations.stats.ruleSkips, 1);
  globalThis.fetch = originalFetch;
});

test('translateFrames writes cache and reuses cached translations', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-cache-'));
  const cachePath = join(tempDir, 'translations.json');
  const checkpointPath = join(tempDir, 'checkpoint.json');
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"translations":[{"index":7,"translated":"专业编码器"}]}' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const modelConfig = {
    endpoint: 'https://api.example.com/v1',
    model: 'test-model',
    apiKey: 'test-key',
  };
  const first = await translateFrames({
    frames: [{ index: 7, text: 'Professional encoder' }],
    modelConfig,
    glossary: '',
    sourceLang: 'English',
    targetLang: '简体中文',
    cachePath,
    checkpointPath,
    cacheScope: 'same-file',
  });
  const second = await translateFrames({
    frames: [{ index: 8, text: 'Professional encoder' }],
    modelConfig,
    glossary: '',
    sourceLang: 'English',
    targetLang: '简体中文',
    cachePath,
    checkpointPath,
    cacheScope: 'same-file',
  });

  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(calls, 1);
  assert.equal(first[0].translated, '专业编码器');
  assert.equal(second[0].translated, '专业编码器');
  assert.equal(checkpoint[0].translated, '专业编码器');
  globalThis.fetch = originalFetch;
});

test('translateFrames emits batch progress events', async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"translations":[{"index":1,"translated":"你好"},{"index":2,"translated":"世界"}]}' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  const translations = await translateFrames({
    frames: [
      { index: 1, text: 'Hello' },
      { index: 2, text: 'World' },
    ],
    modelConfig: {
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      apiKey: 'test-key',
    },
    glossary: '',
    sourceLang: 'English',
    targetLang: '简体中文',
    batchSize: 2,
    onProgress: (event) => events.push(event),
  });

  assert.equal(translations.length, 2);
  assert.ok(events.some((event) => event.stage === 'translating' && event.current === 2));
  assert.equal(translations.stats.batches, 1);
  globalThis.fetch = originalFetch;
});

test('translateFrames reuses current task checkpoint before requesting model', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-checkpoint-'));
  const checkpointPath = join(tempDir, 'translations.json');
  await writeFile(
    checkpointPath,
    JSON.stringify([{ index: 1, original: 'Hello', translated: '你好' }], null, 2),
    'utf8',
  );

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"translations":[{"index":2,"translated":"世界"}]}' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const translations = await translateFrames({
    frames: [
      { index: 1, text: 'Hello' },
      { index: 2, text: 'World' },
    ],
    modelConfig: {
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      apiKey: 'test-key',
    },
    glossary: '',
    sourceLang: 'English',
    targetLang: '简体中文',
    checkpointPath,
    batchSize: 2,
  });

  assert.equal(calls, 1);
  assert.equal(translations[0].translated, '你好');
  assert.equal(translations[1].translated, '世界');
  assert.equal(translations.stats.checkpointHits, 1);
  globalThis.fetch = originalFetch;
});
