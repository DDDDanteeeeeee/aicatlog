import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const defaultFontNames = ['MicrosoftYaHei', 'MicrosoftYaHeiUI', 'SimHei', 'SimSun', 'ArialUnicodeMS'];
const supportedFontExtensions = new Set(['.ttf', '.otf', '.ttc', '.otc']);

export function parsePayload() {
  if (process.env.AGENT_TASK_PAYLOAD) {
    return JSON.parse(process.env.AGENT_TASK_PAYLOAD);
  }

  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1]);
  }

  return {
    sourcePath: args.get('--source') || '',
    outputName: args.get('--output') || '',
    maxFrames: Number(args.get('--max-frames') || process.env.AGENT_MAX_FRAMES || 0),
    modelConfig: {
      provider: args.get('--provider') || 'OpenAI Compatible',
      endpoint: args.get('--endpoint') || '',
      model: args.get('--model') || '',
      apiKey: args.get('--api-key') || '',
    },
  };
}

export function validatePayload(payload) {
  const sourcePath = payload.sourcePath || payload.selectedFile || '';
  if (!sourcePath) {
    throw new Error('Missing source AI file path.');
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`Source AI file does not exist: ${sourcePath}`);
  }
  if (extname(sourcePath).toLowerCase() !== '.ai') {
    throw new Error('Source file must be an .ai file.');
  }

  const modelConfig = payload.modelConfig || {};
  if (!modelConfig.endpoint || !modelConfig.model || !modelConfig.apiKey) {
    throw new Error('Missing model endpoint, model name, or API Key.');
  }

  const customFont = resolveCustomFont(payload);

  return {
    ...payload,
    sourcePath: resolve(sourcePath),
    outputName: payload.outputName || basename(sourcePath).replace(/\.ai$/i, '_中文.ai'),
    modelConfig,
    customFont,
  };
}

export async function createRunWorkspace(payload, root = join(process.cwd(), 'tasks', 'agent-runs')) {
  const requestedRunDir = payload.currentTask?.runDir ? resolve(payload.currentTask.runDir) : '';
  const runId = payload.currentTask?.taskId || `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runDir = requestedRunDir || join(root, runId);
  await mkdir(runDir, { recursive: true });
  await mkdir(resolveOutputDirectory(payload), { recursive: true });

  const sourceCopyPath = join(runDir, `source${extname(payload.sourcePath)}`);
  const outputAiPath = resolve(resolveOutputDirectory(payload), payload.outputName);
  const extractedJsonPath = join(runDir, 'extracted-text.json');
  const translationsJsonPath = join(runDir, 'translations.json');
  const payloadJsxPath = join(runDir, 'translations-payload.jsx');
  const extractJsxPath = join(runDir, 'extract.jsx');
  const applyJsxPath = join(runDir, 'apply.jsx');
  const reportPath = join(runDir, 'report.json');
  const taskReportPath = join(runDir, 'task-report.json');
  const cachePath = join(runDir, 'translation-cache.json');

  await copyFile(payload.sourcePath, sourceCopyPath);

  return {
    runId,
    runDir,
    sourceCopyPath,
    outputAiPath,
    extractedJsonPath,
    translationsJsonPath,
    payloadJsxPath,
    extractJsxPath,
    applyJsxPath,
    reportPath,
    taskReportPath,
    cachePath,
    customFont: payload.customFont || null,
  };
}

export function resolveOutputDirectory(payload) {
  if (payload.outputLocation === '桌面') {
    return join(getUserHome(), 'Desktop');
  }
  if (payload.outputLocation === '文档目录') {
    return join(getUserHome(), 'Documents');
  }
  if (payload.outputLocation === '自定义路径' && payload.outputCustomPath) {
    return resolve(payload.outputCustomPath);
  }
  return dirname(payload.sourcePath);
}

function getUserHome() {
  return process.env.USERPROFILE || homedir();
}

export function toJsString(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

export function toJsonString(value) {
  return JSON.stringify(String(value ?? ''));
}

export function buildExtractJsx({ sourceCopyPath, extractedJsonPath }) {
  return `
var sourcePath = "${toJsString(sourceCopyPath)}";
var outputPath = "${toJsString(extractedJsonPath)}";

function escapeJson(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"').replace(/\\r/g, "\\\\r").replace(/\\n/g, "\\\\n").replace(/\\t/g, "\\\\t");
}

function hasLatinText(value) {
  return /[A-Za-z]/.test(String(value || ""));
}

var rows = [];
var metadata = { sourcePath: sourcePath, scannedAt: String(new Date()), documentName: "", artboards: 0, textFrameCount: 0, latinTextFrameCount: 0, errors: [] };

try {
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var doc = app.open(new File(sourcePath));
  metadata.documentName = doc.name;
  metadata.artboards = doc.artboards.length;
  metadata.textFrameCount = doc.textFrames.length;

  for (var i = 0; i < doc.textFrames.length; i++) {
    var frame = doc.textFrames[i];
    var content = frame.contents;
    if (!hasLatinText(content)) continue;
    metadata.latinTextFrameCount++;
    rows.push({ id: "tf_" + i, index: i, kind: String(frame.kind), layer: frame.layer ? frame.layer.name : "", text: String(content) });
  }
  doc.close(SaveOptions.DONOTSAVECHANGES);
} catch (err) {
  metadata.errors.push(String(err));
  try { if (app.documents.length > 0) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
}

var json = "{\\n";
json += '  "metadata": {' +
  '"sourcePath": "' + escapeJson(metadata.sourcePath) + '",' +
  '"scannedAt": "' + escapeJson(metadata.scannedAt) + '",' +
  '"documentName": "' + escapeJson(metadata.documentName) + '",' +
  '"artboards": ' + metadata.artboards + ',' +
  '"textFrameCount": ' + metadata.textFrameCount + ',' +
  '"latinTextFrameCount": ' + metadata.latinTextFrameCount + ',' +
  '"errors": []' +
  '},\\n';
json += '  "frames": [\\n';
for (var r = 0; r < rows.length; r++) {
  var row = rows[r];
  json += '    {"id":"' + escapeJson(row.id) + '","index":' + row.index + ',"kind":"' + escapeJson(row.kind) + '","layer":"' + escapeJson(row.layer) + '","text":"' + escapeJson(row.text) + '"}' + (r < rows.length - 1 ? "," : "") + "\\n";
}
json += "  ]\\n}";

var outputFile = new File(outputPath);
outputFile.encoding = "UTF-8";
outputFile.open("w");
outputFile.write(json);
outputFile.close();
`;
}

export function buildTranslationsPayload(translations) {
  const lines = translations.map((item) => {
    return `  { index: ${Number(item.index)}, original: ${toJsonString(item.original)}, translated: ${toJsonString(item.translated)} }`;
  });
  return `var payload = { frameTranslations: [\n${lines.join(',\n')}\n] };\n`;
}

export function buildApplyJsx({ sourceCopyPath, payloadJsxPath, outputAiPath, reportPath, customFont }) {
  const fontNames = customFont?.candidates?.length ? customFont.candidates : defaultFontNames;
  return `
var sourceAiPath = "${toJsString(sourceCopyPath)}";
var translationsPath = "${toJsString(payloadJsxPath)}";
var outputAiPath = "${toJsString(outputAiPath)}";
var reportPath = "${toJsString(reportPath)}";

function hasChinese(text) { return /[\\u3400-\\u9fff]/.test(text); }
function getFirstAvailableFont(names) {
  for (var i = 0; i < names.length; i++) {
    try { return app.textFonts.getByName(names[i]); } catch (e) {}
  }
  for (var f = 0; f < app.textFonts.length; f++) {
    try {
      var font = app.textFonts[f];
      var fontName = normalizeFontName(font.name);
      var fontFamily = normalizeFontName(font.family);
      for (var n = 0; n < names.length; n++) {
        var candidate = normalizeFontName(names[n]);
        if (fontName === candidate || fontFamily === candidate || fontName.indexOf(candidate) >= 0) return font;
      }
    } catch (scanError) {}
  }
  return null;
}
function normalizeFontName(value) { return String(value || "").replace(/[^A-Za-z0-9\\u3400-\\u9fff]/g, "").toLowerCase(); }

$.evalFile(translationsPath);
var translations = payload.frameTranslations || [];
var requestedFontNames = ${JSON.stringify(fontNames)};
var chineseFont = getFirstAvailableFont(requestedFontNames);
var doc = app.open(new File(sourceAiPath));
var replaced = 0;
var skipped = 0;
var fontApplied = 0;
var errors = [];

for (var i = 0; i < translations.length; i++) {
  var item = translations[i];
  try {
    var frame = doc.textFrames[item.index];
    if (!frame) { skipped++; continue; }
    var translated = item.translated || item.original || "";
    frame.contents = translated;
    if (chineseFont && hasChinese(translated)) {
      try { frame.textRange.characterAttributes.textFont = chineseFont; fontApplied++; } catch (fontError) {}
    }
    replaced++;
  } catch (e) {
    errors.push({ index: item.index, message: String(e) });
  }
}

var saveOptions = new IllustratorSaveOptions();
saveOptions.pdfCompatible = true;
try { saveOptions.compressed = true; } catch (e) {}
doc.saveAs(new File(outputAiPath), saveOptions);
doc.close(SaveOptions.DONOTSAVECHANGES);

var report = "{\\n";
report += '  "outputAiPath": "' + outputAiPath + '",\\n';
report += '  "replaced": ' + replaced + ',\\n';
report += '  "skipped": ' + skipped + ',\\n';
report += '  "fontApplied": ' + fontApplied + ',\\n';
report += '  "fontName": "' + (chineseFont ? chineseFont.name : "") + '",\\n';
report += '  "requestedFont": "' + requestedFontNames.join(", ") + '",\\n';
report += '  "errorCount": ' + errors.length + '\\n';
report += "}";

var reportFile = new File(reportPath);
reportFile.encoding = "UTF-8";
reportFile.open("w");
reportFile.write(report);
reportFile.close();
`;
}

export function parseGlossary(glossary = '') {
  return String(glossary)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [source, ...targetParts] = line.split('=');
      return { source: source.trim(), target: targetParts.join('=').trim() || source.trim() };
    })
    .filter((item) => item.source);
}

export function buildTranslationRequest({ frames, modelConfig, glossary, sourceLang = 'English', targetLang = 'Simplified Chinese' }) {
  const terms = parseGlossary(glossary);
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
            'You are a professional catalog localization engine. Return strict JSON only. Preserve numbers, model names, brand names, placeholders, and line breaks when possible.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Translate Illustrator text frames.',
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
            glossary: terms,
            outputSchema: { translations: [{ index: 0, translated: '中文' }] },
            frames: frames.map((frame) => ({ index: frame.index, text: frame.text })),
          }),
        },
      ],
    },
  };
}

export function normalizeChatCompletionsEndpoint(endpoint) {
  const trimmed = String(endpoint || '').replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export async function translateFrames({
  frames,
  modelConfig,
  glossary,
  sourceLang,
  targetLang,
  batchSize = 10,
  timeoutMs = 60000,
  cachePath = '',
  checkpointPath = '',
  cacheScope = '',
  maxRetries = 2,
  retryDelayMs = 1200,
  onProgress = null,
} = {}) {
  const translations = [];
  const cache = await loadTranslationCache(cachePath);
  const checkpoint = await loadTranslationCheckpoint(checkpointPath);
  const checkpointByIndex = new Map(checkpoint.map((item) => [Number(item.index), item]));
  const stats = {
    total: frames.length,
    batchSize,
    batches: Math.ceil(frames.length / batchSize),
    checkpointHits: 0,
    cacheHits: 0,
    modelRequests: 0,
  };
  const cacheContext = {
    provider: modelConfig.provider || '',
    endpoint: normalizeChatCompletionsEndpoint(modelConfig.endpoint || ''),
    model: modelConfig.model || '',
    glossary: glossary || '',
    sourceLang: sourceLang || '',
    targetLang: targetLang || '',
    cacheScope,
  };

  for (let index = 0; index < frames.length; index += batchSize) {
    const batch = frames.slice(index, index + batchSize);
    const batchNumber = Math.floor(index / batchSize) + 1;
    const batchTranslations = [];
    const uncachedFrames = [];

    for (const frame of batch) {
      const checkpointTranslation = checkpointByIndex.get(Number(frame.index));
      if (checkpointTranslation) {
        stats.checkpointHits += 1;
        batchTranslations.push({
          index: frame.index,
          original: frame.text,
          translated: String(checkpointTranslation.translated || checkpointTranslation.original || frame.text),
        });
        continue;
      }

      const cacheKey = buildTranslationCacheKey(cacheContext, frame.text);
      const cachedTranslation = cache.entries[cacheKey];
      if (typeof cachedTranslation === 'string') {
        stats.cacheHits += 1;
        batchTranslations.push({ index: frame.index, original: frame.text, translated: cachedTranslation });
      } else {
        uncachedFrames.push({ ...frame, cacheKey });
      }
    }

    if (uncachedFrames.length > 0) {
      stats.modelRequests += 1;
      emitProgress(onProgress, {
        stage: 'translating',
        message: `正在翻译第 ${batchNumber}/${stats.batches} 批，${uncachedFrames.length} 条需要请求模型。`,
        current: index,
        total: frames.length,
        batch: batchNumber,
        batches: stats.batches,
        percent: progressPercent(35, 55, index, frames.length),
        cacheHits: stats.cacheHits,
        checkpointHits: stats.checkpointHits,
      });
      const freshTranslations = await translateBatchWithRetry({
        batch: uncachedFrames,
        modelConfig,
        glossary,
        sourceLang,
        targetLang,
        timeoutMs,
        maxRetries,
        retryDelayMs,
      });

      for (const item of freshTranslations) {
        const frame = uncachedFrames.find((candidate) => Number(candidate.index) === Number(item.index));
        if (frame) {
          cache.entries[frame.cacheKey] = item.translated;
        }
        batchTranslations.push(item);
      }

      await saveTranslationCache(cachePath, cache);
    }

    const ordered = batch.map((frame) => {
      return batchTranslations.find((item) => Number(item.index) === Number(frame.index)) || {
        index: frame.index,
        original: frame.text,
        translated: frame.text,
      };
    });
    translations.push(...ordered);

    if (checkpointPath) {
      await writeFile(checkpointPath, JSON.stringify(translations, null, 2), 'utf8');
    }
    emitProgress(onProgress, {
      stage: 'translating',
      message: `已完成第 ${batchNumber}/${stats.batches} 批翻译，累计 ${translations.length}/${frames.length} 条。`,
      current: translations.length,
      total: frames.length,
      batch: batchNumber,
      batches: stats.batches,
      percent: progressPercent(35, 55, translations.length, frames.length),
      cacheHits: stats.cacheHits,
      checkpointHits: stats.checkpointHits,
    });
  }
  translations.stats = stats;
  return translations;
}

async function translateBatchWithRetry({ batch, modelConfig, glossary, sourceLang, targetLang, timeoutMs, maxRetries, retryDelayMs }) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await translateBatch({ batch, modelConfig, glossary, sourceLang, targetLang, timeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await delay(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}

async function translateBatch({ batch, modelConfig, glossary, sourceLang, targetLang, timeoutMs }) {
  const request = buildTranslationRequest({ frames: batch, modelConfig, glossary, sourceLang, targetLang });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(request.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${modelConfig.apiKey}`,
    },
    body: JSON.stringify(request.body),
    signal: controller.signal,
  }).catch((error) => {
    if (error?.name === 'AbortError') {
      throw new Error('模型服务请求超时，请检查网络、API Endpoint 或模型服务状态。');
    }
    throw error;
  }).finally(() => clearTimeout(timeout));

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`模型服务请求失败：HTTP ${response.status} ${trimForLog(responseText)}`);
  }
  if (!responseText.trim()) {
    throw new Error('模型服务返回空响应，请检查 API Endpoint、模型名称、API Key 或账号额度。');
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`模型服务返回的接口响应不是有效 JSON：${trimForLog(responseText)}`);
  }
  const content = data.choices?.[0]?.message?.content;
  const parsed = parseModelJsonContent(content);
  const byIndex = new Map(parsed.translations.map((item) => [Number(item.index), String(item.translated || '')]));
  return batch.map((frame) => ({
    index: frame.index,
    original: frame.text,
    translated: byIndex.get(Number(frame.index)) || frame.text,
  }));
}

async function loadTranslationCache(cachePath) {
  if (!cachePath || !existsSync(cachePath)) {
    return { version: 1, entries: {} };
  }

  try {
    const data = JSON.parse(await readFile(cachePath, 'utf8'));
    return { version: 1, entries: data.entries && typeof data.entries === 'object' ? data.entries : {} };
  } catch {
    return { version: 1, entries: {} };
  }
}

async function loadTranslationCheckpoint(checkpointPath) {
  if (!checkpointPath || !existsSync(checkpointPath)) {
    return [];
  }

  try {
    const data = JSON.parse(await readFile(checkpointPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveTranslationCache(cachePath, cache) {
  if (!cachePath) return;
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

function buildTranslationCacheKey(context, text) {
  return createHash('sha256')
    .update(JSON.stringify({ ...context, text }))
    .digest('hex');
}

async function getSourceCacheScope(sourcePath) {
  const sourceStat = await stat(sourcePath);
  return createHash('sha256')
    .update(JSON.stringify({ sourcePath: resolve(sourcePath), size: sourceStat.size, mtimeMs: Math.trunc(sourceStat.mtimeMs) }))
    .digest('hex');
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function emitProgress(onProgress, event) {
  if (typeof onProgress !== 'function') return;
  onProgress({
    at: new Date().toISOString(),
    ...event,
  });
}

function progressPercent(start, span, current, total) {
  if (!total) return start;
  return Math.min(98, Math.round(start + (span * current) / total));
}

export function parseModelJsonContent(content) {
  const raw = String(content || '').trim();
  if (!raw) {
    throw new Error('Model response is empty.');
  }

  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1].trim() : raw;
  return JSON.parse(jsonText);
}

function trimForLog(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

export function runIllustratorJsx(jsxPath) {
  const escaped = String(resolve(jsxPath)).replace(/'/g, "''");
  const command = `$app = New-Object -ComObject Illustrator.Application; $app.DoJavaScriptFile('${escaped}')`;
  return runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
}

export function runCommand(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `${command} exited with ${code}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

function resolveCustomFont(payload) {
  const fontPath = String(payload.fontPath || '').trim();
  if (!fontPath) return null;
  const resolvedPath = resolve(fontPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Font file does not exist: ${resolvedPath}`);
  }
  const extension = extname(resolvedPath).toLowerCase();
  if (!supportedFontExtensions.has(extension)) {
    throw new Error('Font file must be .ttf, .otf, .ttc, or .otc.');
  }
  const fontName = String(payload.fontName || basename(resolvedPath, extension)).trim();
  return {
    sourcePath: resolvedPath,
    fileName: basename(resolvedPath),
    displayName: fontName || basename(resolvedPath),
    candidates: buildFontCandidates(fontName || basename(resolvedPath, extension)),
  };
}

function buildFontCandidates(name) {
  const base = String(name || '').replace(/\.(ttf|otf|ttc|otc)$/i, '').trim();
  const compact = base.replace(/[\s_-]+/g, '');
  return [...new Set([base, compact, base.replace(/-/g, ' '), base.replace(/_/g, ' ')].filter(Boolean))];
}

async function prepareCustomFont(customFont) {
  if (!customFont?.sourcePath || process.platform !== 'win32') return customFont;
  const installed = await installFontForCurrentUser(customFont.sourcePath);
  return {
    ...customFont,
    candidates: [...new Set([...(installed.candidates || []), ...(customFont.candidates || [])])],
    installedPath: installed.installedPath,
  };
}

async function installFontForCurrentUser(fontPath) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = ${JSON.stringify(fontPath)}
$fontDir = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Fonts'
New-Item -ItemType Directory -Force -Path $fontDir | Out-Null
$dest = Join-Path $fontDir ([IO.Path]::GetFileName($source))
Copy-Item -LiteralPath $source -Destination $dest -Force
$pfc = New-Object System.Drawing.Text.PrivateFontCollection
$pfc.AddFontFile($dest)
$families = @($pfc.Families | ForEach-Object { $_.Name })
$regPath = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
New-Item -Path $regPath -Force | Out-Null
foreach ($family in $families) {
  New-ItemProperty -Path $regPath -Name ($family + ' (TrueType)') -Value $dest -PropertyType String -Force | Out-Null
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class FontNative {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)]
  public static extern int AddFontResource(string lpFileName);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
}
'@
[FontNative]::AddFontResource($dest) | Out-Null
$result = [UIntPtr]::Zero
[FontNative]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [UIntPtr]::Zero, $null, 0x0002, 1000, [ref]$result) | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::WriteLine((@{ installedPath = $dest; families = $families } | ConvertTo-Json -Compress))
`;
  const result = await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  const data = JSON.parse(result.stdout.trim() || '{}');
  const families = Array.isArray(data.families) ? data.families : data.families ? [data.families] : [];
  return {
    installedPath: data.installedPath || fontPath,
    candidates: families.flatMap((family) => buildFontCandidates(family)),
  };
}

async function runAgentTaskLegacy(rawPayload) {
  const payload = validatePayload(rawPayload);
  const workspace = await createRunWorkspace(payload);
  const logs = [];

  await writeFile(workspace.extractJsxPath, buildExtractJsx(workspace), 'utf8');
  logs.push('已生成文本提取脚本。');
  await runIllustratorJsx(workspace.extractJsxPath);
  logs.push('已从 AI 文件提取英文文本。');

  const extracted = JSON.parse(await readFile(workspace.extractedJsonPath, 'utf8'));
  if (extracted.metadata?.errors?.length) {
    throw new Error(`Illustrator extraction failed: ${extracted.metadata.errors.join('; ')}`);
  }

  const framesToTranslate = payload.maxFrames ? extracted.frames.slice(0, Number(payload.maxFrames)) : extracted.frames;
  logs.push(payload.maxFrames ? `试运行模式：仅翻译前 ${framesToTranslate.length} 条文本。` : `准备翻译 ${framesToTranslate.length} 条文本。`);

  const translations = await translateFrames({
    frames: framesToTranslate,
    modelConfig: payload.modelConfig,
    glossary: payload.glossary,
    sourceLang: payload.sourceLang,
    targetLang: payload.targetLang,
    cachePath: workspace.cachePath,
    checkpointPath: workspace.translationsJsonPath,
    cacheScope: await getSourceCacheScope(payload.sourcePath),
  });
  logs.push(`已完成 ${translations.length} 条文本翻译。`);

  await writeFile(workspace.translationsJsonPath, JSON.stringify(translations, null, 2), 'utf8');
  await writeFile(workspace.payloadJsxPath, buildTranslationsPayload(translations), 'utf8');
  workspace.customFont = await prepareCustomFont(payload.customFont);
  await writeFile(workspace.applyJsxPath, buildApplyJsx(workspace), 'utf8');
  logs.push('已生成翻译回写脚本。');

  await runIllustratorJsx(workspace.applyJsxPath);
  logs.push('已生成可编辑 AI 输出文件。');

  const applyReport = JSON.parse(await readFile(workspace.reportPath, 'utf8'));
  return {
    ok: true,
    mode: 'illustrator-local',
    input: payload.sourcePath,
    output: workspace.outputAiPath,
    runDir: workspace.runDir,
    logs,
    stats: {
      textFrames: extracted.metadata?.textFrameCount ?? extracted.frames.length,
      translatedFrames: applyReport.replaced ?? translations.length,
      errors: applyReport.errorCount ?? 0,
    },
    report: applyReport,
  };
}

export async function runAgentTask(rawPayload, options = {}) {
  const startedAt = Date.now();
  const onProgress = options.onProgress;
  const payload = validatePayload(rawPayload);
  const workspace = await createRunWorkspace(payload);
  const logs = [];

  emitProgress(onProgress, { stage: 'preparing', message: '正在创建任务工作区。', percent: 5 });
  await writeFile(workspace.extractJsxPath, buildExtractJsx(workspace), 'utf8');
  logs.push('已生成文本提取脚本。');

  emitProgress(onProgress, { stage: 'extracting', message: '正在通过 Illustrator 打开源文件并提取英文文本。', percent: 15 });
  await runIllustratorJsx(workspace.extractJsxPath);
  logs.push('已从 AI 文件提取英文文本。');

  const extracted = JSON.parse(await readFile(workspace.extractedJsonPath, 'utf8'));
  if (extracted.metadata?.errors?.length) {
    throw new Error(`Illustrator extraction failed: ${extracted.metadata.errors.join('; ')}`);
  }

  const framesToTranslate = payload.maxFrames ? extracted.frames.slice(0, Number(payload.maxFrames)) : extracted.frames;
  logs.push(payload.maxFrames ? `试运行模式：仅翻译前 ${framesToTranslate.length} 条文本。` : `准备翻译 ${framesToTranslate.length} 条文本。`);
  emitProgress(onProgress, {
    stage: 'extracted',
    message: `已提取 ${extracted.frames.length} 条英文文本，准备处理 ${framesToTranslate.length} 条。`,
    current: 0,
    total: framesToTranslate.length,
    percent: 30,
  });

  const translations = await translateFrames({
    frames: framesToTranslate,
    modelConfig: payload.modelConfig,
    glossary: payload.glossary,
    sourceLang: payload.sourceLang,
    targetLang: payload.targetLang,
    cachePath: workspace.cachePath,
    checkpointPath: workspace.translationsJsonPath,
    cacheScope: await getSourceCacheScope(payload.sourcePath),
    onProgress,
  });
  const translationStats = translations.stats || {};
  logs.push(`已完成 ${translations.length} 条文本翻译。`);

  await writeFile(workspace.translationsJsonPath, JSON.stringify(translations, null, 2), 'utf8');
  await writeFile(workspace.payloadJsxPath, buildTranslationsPayload(translations), 'utf8');
  workspace.customFont = await prepareCustomFont(payload.customFont);
  await writeFile(workspace.applyJsxPath, buildApplyJsx(workspace), 'utf8');
  logs.push('已生成翻译回写脚本。');

  emitProgress(onProgress, { stage: 'applying', message: '正在通过 Illustrator 回写译文并保存可编辑 .ai 文件。', percent: 92 });
  await runIllustratorJsx(workspace.applyJsxPath);
  logs.push('已生成可编辑 AI 输出文件。');

  const applyReport = JSON.parse(await readFile(workspace.reportPath, 'utf8'));
  const taskReport = {
    sourcePath: payload.sourcePath,
    outputAiPath: workspace.outputAiPath,
    runDir: workspace.runDir,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    provider: payload.modelConfig.provider || '',
    model: payload.modelConfig.model || '',
    targetLang: payload.targetLang || '',
    totalTextFrames: extracted.metadata?.textFrameCount ?? extracted.frames.length,
    latinTextFrames: extracted.frames.length,
    requestedTranslations: framesToTranslate.length,
    translatedFrames: applyReport.replaced ?? translations.length,
    skippedFrames: applyReport.skipped ?? 0,
    errorCount: applyReport.errorCount ?? 0,
    checkpointHits: translationStats.checkpointHits ?? 0,
    cacheHits: translationStats.cacheHits ?? 0,
    modelRequests: translationStats.modelRequests ?? 0,
    batchSize: translationStats.batchSize ?? 0,
    batches: translationStats.batches ?? 0,
  };
  await writeFile(workspace.taskReportPath, JSON.stringify(taskReport, null, 2), 'utf8');
  emitProgress(onProgress, { stage: 'done', message: '任务完成，已生成可编辑 .ai 输出文件。', percent: 100 });

  return {
    ok: true,
    mode: 'illustrator-local',
    input: payload.sourcePath,
    output: workspace.outputAiPath,
    runDir: workspace.runDir,
    logs,
    stats: {
      textFrames: extracted.metadata?.textFrameCount ?? extracted.frames.length,
      translatedFrames: applyReport.replaced ?? translations.length,
      errors: applyReport.errorCount ?? 0,
    },
    taskReport,
    report: applyReport,
  };
}
