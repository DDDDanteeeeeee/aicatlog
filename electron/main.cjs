const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { hostname, userInfo } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { TextDecoder } = require('node:util');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function getConfigPath() {
  const dir = join(app.getPath('userData'), 'config');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'agent-config.json');
}

function readConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return decryptSecrets(readJsonFile(configPath));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  const current = readConfig();
  const next = { ...current, ...config, updatedAt: new Date().toISOString() };
  writeFileSync(getConfigPath(), JSON.stringify(encryptSecrets(next), null, 2), 'utf8');
  return next;
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function encryptValue(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return value || '';
  return `enc:${safeStorage.encryptString(value).toString('base64')}`;
}

function decryptValue(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:') || !safeStorage.isEncryptionAvailable()) return value || '';
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  } catch {
    return '';
  }
}

function encryptSecrets(config) {
  return {
    ...config,
    account: config.account
      ? {
          ...config.account,
          activationCode: encryptValue(config.account.activationCode),
          licenseToken: encryptValue(config.account.licenseToken),
        }
      : config.account,
    modelConfig: config.modelConfig
      ? { ...config.modelConfig, apiKey: encryptValue(config.modelConfig.apiKey) }
      : config.modelConfig,
  };
}

function decryptSecrets(config) {
  return {
    ...config,
    account: config.account
      ? {
          ...config.account,
          activationCode: decryptValue(config.account.activationCode),
          licenseToken: decryptValue(config.account.licenseToken),
        }
      : config.account,
    modelConfig: config.modelConfig
      ? { ...config.modelConfig, apiKey: decryptValue(config.modelConfig.apiKey) }
      : config.modelConfig,
  };
}

function getDeviceId() {
  return createHash('sha256')
    .update(`${process.platform}:${process.arch}:${hostname()}:${userInfo().username}`)
    .digest('hex');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    title: 'AI Catalog Agent',
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  if (process.env.AGENT_AUTORUN_SOURCE) {
    runAutorunTask()
      .then(() => app.quit())
      .catch((error) => {
        writeAutorunResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
        app.quit();
      });
    return;
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('config:load', () => readConfig());
ipcMain.handle('config:save', (_event, config) => saveConfig(config));

ipcMain.handle('dialog:select-ai-file', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择 Illustrator .ai 源文件',
    properties: ['openFile'],
    filters: [
      { name: 'Adobe Illustrator', extensions: ['ai'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

ipcMain.handle('dialog:select-font-file', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择字体文件',
    properties: ['openFile'],
    filters: [
      { name: 'Font Files', extensions: ['ttf', 'otf', 'ttc', 'otc'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('system:check', async () => {
  const illustrator = await checkIllustratorCom();
  return [
    { id: 'os', status: process.platform === 'win32' ? 'passed' : 'failed', detail: process.platform === 'win32' ? 'Windows 本机环境可用' : '当前版本仅支持 Windows' },
    { id: 'script', status: 'passed', detail: '本地执行器脚本可调用' },
    { id: 'font', status: 'warning', detail: '执行时会优先尝试 Microsoft YaHei / SimHei 等中文字体' },
    illustrator,
  ];
});

ipcMain.handle('license:verify', async (_event, payload) => {
  const endpoint = payload?.licenseEndpoint;
  if (!endpoint) {
    return { ok: false, reason: 'MISSING_LICENSE_ENDPOINT', message: '缺少授权服务地址。' };
  }

  const verifyOnly = Boolean(payload?.verifyOnly);
  const targetEndpoint = verifyOnly ? endpoint.replace(/\/activate\/?$/, '/verify') : endpoint;
  const body = { ...payload, deviceId: getDeviceId(), appVersion: app.getVersion() };
  delete body.verifyOnly;
  delete body.licenseEndpoint;

  const response = await fetch(targetEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    try {
      return await response.json();
    } catch {
      return { ok: false, message: `授权服务返回 ${response.status}` };
    }
  }

  return response.json();
});

ipcMain.handle('task:run', async (event, payload) => {
  return runTaskPayload(payload, event);
});

ipcMain.handle('shell:open-path', async (_event, path) => {
  if (!path) return false;
  await shell.openPath(path);
  return true;
});

ipcMain.handle('shell:reveal-path', async (_event, path) => {
  if (!path) return false;
  shell.showItemInFolder(path);
  return true;
});

function runTaskPayload(payload, event) {
  const runner = join(__dirname, '..', 'scripts', 'agent-runner.mjs');
  return new Promise((resolve) => {
    let progressBuffer = '';
    const child = spawn(process.execPath, [runner], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        AGENT_PROGRESS: '1',
        AGENT_TASK_PAYLOAD: JSON.stringify(payload ?? {}),
      },
      windowsHide: true,
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      progressBuffer += decodeProcessOutput([chunk]);
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('__AGENT_PROGRESS__')) {
          try {
            event?.sender?.send('task:progress', JSON.parse(line.slice('__AGENT_PROGRESS__'.length)));
          } catch {}
        } else if (line.trim()) {
          stderrChunks.push(Buffer.from(`${line}\n`, 'utf8'));
        }
      }
    });
    child.on('close', (code) => {
      if (progressBuffer.startsWith('__AGENT_PROGRESS__')) {
        try {
          event?.sender?.send('task:progress', JSON.parse(progressBuffer.slice('__AGENT_PROGRESS__'.length)));
        } catch {}
      } else if (progressBuffer.trim()) {
        stderrChunks.push(Buffer.from(progressBuffer, 'utf8'));
      }
      const stdout = decodeProcessOutput(stdoutChunks);
      const stderr = decodeProcessOutput(stderrChunks);
      if (code !== 0) {
        resolve({ ok: false, code, stderr });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ ok: false, code, stderr: '任务输出不是有效 JSON。' });
      }
    });
  });
}

function decodeProcessOutput(chunks) {
  const buffer = Buffer.concat(chunks);
  const utf8 = buffer.toString('utf8');
  if (!hasBrokenUtf8Markers(utf8)) return utf8;
  try {
    const gb18030 = new TextDecoder('gb18030').decode(buffer);
    return hasBrokenUtf8Markers(gb18030) ? utf8 : gb18030;
  } catch {
    return utf8;
  }
}

function hasBrokenUtf8Markers(value) {
  return /�|锘�|Ã|Â|â€/.test(value || '');
}

async function runAutorunTask() {
  const config = readConfig();
  const sourcePath = resolve(process.env.AGENT_AUTORUN_SOURCE);
  const resultPath = resolve(process.env.AGENT_AUTORUN_RESULT || join(process.cwd(), 'tasks', 'agent-autorun-result.json'));
  const outputLocation = process.env.AGENT_AUTORUN_OUTPUT_LOCATION || '自定义路径';
  const outputCustomPath = process.env.AGENT_AUTORUN_OUTPUT_DIR || join(process.cwd(), 'outputs');
  const outputName = process.env.AGENT_AUTORUN_OUTPUT_NAME || sourcePath.split(/[\\/]/).pop().replace(/\.ai$/i, '_中文.ai');
  const maxFrames = Number(process.env.AGENT_AUTORUN_MAX_FRAMES || 0);
  const autorunTaskId = process.env.AGENT_AUTORUN_TASK_ID || '';

  if (!config.modelConfig?.apiKey) {
    const rawConfig = existsSync(getConfigPath()) ? readJsonFile(getConfigPath()) : {};
    writeAutorunResult(
      {
        ok: false,
        message: '缺少模型 API Key，请先在桌面端模型配置里保存 API Key。',
        diagnostics: {
          configPath: getConfigPath(),
          safeStorageAvailable: safeStorage.isEncryptionAvailable(),
          hasRawModelConfig: Boolean(rawConfig.modelConfig),
          hasRawApiKey: Boolean(rawConfig.modelConfig?.apiKey),
          apiKeyLooksEncrypted: typeof rawConfig.modelConfig?.apiKey === 'string' && rawConfig.modelConfig.apiKey.startsWith('enc:'),
          provider: rawConfig.modelConfig?.provider || '',
          endpoint: rawConfig.modelConfig?.endpoint || '',
          model: rawConfig.modelConfig?.model || '',
        },
      },
      resultPath,
    );
    return;
  }

  const payload = {
    sourcePath,
    outputName,
    outputLocation,
    outputCustomPath,
    maxFrames,
    sourceLang: '英文',
    targetLang: '简体中文',
    glossary: '',
    selectedFile: '',
    modelConfig: config.modelConfig,
    currentTask: autorunTaskId ? { taskId: autorunTaskId, sourcePath, status: 'running' } : null,
  };
  const result = await runTaskPayload(payload);
  writeAutorunResult(result, resultPath);
}

function writeAutorunResult(result, resultPath = resolve(process.env.AGENT_AUTORUN_RESULT || join(process.cwd(), 'tasks', 'agent-autorun-result.json'))) {
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
}

function checkIllustratorCom() {
  if (process.platform !== 'win32') {
    return Promise.resolve({ id: 'illustrator', status: 'failed', detail: '当前版本仅支持 Windows Illustrator 自动化' });
  }

  const command = [
    '$ErrorActionPreference = "Stop"',
    '$app = New-Object -ComObject Illustrator.Application',
    '$version = $app.Version',
    'Write-Output $version',
  ].join('; ');

  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ id: 'illustrator', status: 'passed', detail: `Illustrator 可调用，版本 ${stdout.trim() || '未知'}` });
      } else {
        resolve({ id: 'illustrator', status: 'failed', detail: stderr.trim() || '无法通过本机接口调用 Illustrator' });
      }
    });
  });
}
