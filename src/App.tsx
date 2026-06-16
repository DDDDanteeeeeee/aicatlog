import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileOutput,
  FileText,
  FolderOpen,
  Languages,
  ListFilter,
  Loader2,
  Lock,
  MonitorCheck,
  Plus,
  Play,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  UnlockKeyhole,
  X,
} from 'lucide-react';

type CheckStatus = 'pending' | 'running' | 'passed' | 'warning' | 'failed';
type JobStatus = 'idle' | 'running' | 'done';
type ModalName = 'activation' | 'points' | null;

type TaskProgress = {
  stage: string;
  message: string;
  percent?: number;
  current?: number;
  total?: number;
  batch?: number;
  batches?: number;
  cacheHits?: number;
  checkpointHits?: number;
  at?: string;
};

type AccountState = {
  activationCode: string;
  licenseEndpoint: string;
  licenseToken?: string;
  licenseId?: string;
  plan?: string;
  planLabel?: string;
  expiresAt?: string | null;
  pointsBalance?: number;
  lastVerifiedAt?: string;
};

type TaskState = {
  sourcePath: string;
  outputName: string;
  outputLocation: string;
  outputCustomPath: string;
  sourceLang: string;
  targetLang: string;
  translationRules: TranslationRule[];
  fontPath: string;
  fontName: string;
  glossary: string;
};

type DetectedTextGroup = {
  id: string;
  label: string;
  detail: string;
  textFrames: number;
  characters: number;
  samples: string[];
  recommendation?: string;
};

type TranslationRule = {
  id: string;
  source: string;
  target: string;
};

type CurrentTaskContext = {
  taskId: string;
  sourcePath: string;
  status: 'idle' | 'running' | 'failed' | 'completed';
  runDir?: string;
};

type AgentConfig = {
  account?: AccountState;
  task?: TaskState;
  licensed?: boolean;
};

type TaskResult = {
  ok: boolean;
  output?: string;
  stderr?: string;
  message?: string;
  logs?: string[];
  stats?: {
    textFrames: number;
    translatedFrames: number;
    errors: number;
  };
  taskReport?: {
    runDir?: string;
    checkpointHits?: number;
    cacheHits?: number;
    modelRequests?: number;
    durationMs?: number;
  };
};

type LicenseResponse = {
  ok: boolean;
  message?: string;
  licenseToken?: string;
  licenseId?: string;
  plan?: string;
  planLabel?: string;
  expiresAt?: string | null;
  pointsBalance?: number;
  redeemedPoints?: number;
  consumedPoints?: number;
  refundedPoints?: number;
  requiredPoints?: number;
  reason?: string;
};

type FileInfoResponse = {
  ok: boolean;
  path?: string;
  size?: number;
  message?: string;
};

type AgentBridge = {
  loadConfig: () => Promise<AgentConfig>;
  saveConfig: (config: AgentConfig) => Promise<AgentConfig>;
  selectAiFile: () => Promise<string | null>;
  selectFontFile: () => Promise<string | null>;
  getFileInfo: (path: string) => Promise<FileInfoResponse>;
  runSystemCheck: () => Promise<Array<{ id: string; status: CheckStatus; detail?: string }>>;
  verifyLicense: (payload: AccountState & { verifyOnly?: boolean }) => Promise<LicenseResponse>;
  redeemPoints: (payload: AccountState & { redeemCode: string }) => Promise<LicenseResponse>;
  runTask: (payload: TaskState & { selectedFile: string; account: AccountState; requiredPoints: number; currentTask?: CurrentTaskContext | null }) => Promise<TaskResult>;
  onTaskProgress?: (callback: (progress: TaskProgress) => void) => () => void;
  openPath: (path: string) => Promise<boolean>;
  revealPath: (path: string) => Promise<boolean>;
};

declare global {
  interface Window {
    agentBridge?: AgentBridge;
  }
}

const targetLanguages = ['简体中文', '繁体中文', '英语', '日语', '韩语', '法语', '德语', '西班牙语', '葡萄牙语', '意大利语', '俄语', '阿拉伯语'];
const outputLocations = ['源文件同目录', '桌面', '文档目录', '自定义路径'];
const defaultTranslationScope = '全部可翻译文字';
const detectedTextGroups: DetectedTextGroup[] = [
  {
    id: 'zh-Hans',
    label: '简体中文',
    detail: '检测到产品说明、参数描述和标题中的简体中文内容',
    textFrames: 49,
    characters: 1860,
    samples: ['生产线对工作环境的要求', '设备用途', '海缆生产线'],
    recommendation: '适合转换为繁体中文并保留英文原文',
  },
  {
    id: 'en',
    label: '英文',
    detail: '检测到英文产品名称、说明和型号相关内容',
    textFrames: 42,
    characters: 2140,
    samples: ['Equipment Application', 'Power supply', 'Submarine cable production line'],
  },
];
const mixedTextNotice = {
  textFrames: 18,
  samples: ['◎海缆生产线 Submarine cable production line', '150+90+45海缆复合挤出生产线'],
};
const baseTranslationScopes = ['简体中文', '繁体中文', '英文', '日文', '韩文'];
const initialTranslationRules: TranslationRule[] = [{ id: 'rule-default', source: '简体中文', target: '繁体中文' }];
const storageKey = 'ai-catalog-agent-config';
const acceptedExtensions = '.ai';
const defaultLicenseEndpoint = import.meta.env.VITE_LICENSE_ENDPOINT || 'http://127.0.0.1:8787/api/license/activate';
const initialTaskState: TaskState = {
  sourcePath: '',
  outputName: '',
  outputLocation: '源文件同目录',
  outputCustomPath: '',
  sourceLang: defaultTranslationScope,
  targetLang: '简体中文',
  translationRules: initialTranslationRules,
  fontPath: '',
  fontName: '',
  glossary: '',
};

const initialChecks = [
  { id: 'os', name: '系统执行能力', detail: '本机目录读写与进程调用', status: 'pending' as CheckStatus },
  { id: 'illustrator', name: 'Illustrator 调用能力', detail: '可调用本机 Illustrator 处理 .ai 文件', status: 'pending' as CheckStatus },
  { id: 'script', name: '本地执行器权限', detail: '允许读取 AI、写入副本和报告', status: 'pending' as CheckStatus },
  { id: 'font', name: '中文字体可用性', detail: '用于回写中文文本时保持版式稳定', status: 'pending' as CheckStatus },
];

const fallbackBridge: AgentBridge = {
  async loadConfig() {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : {};
  },
  async saveConfig(config) {
    const current = await this.loadConfig();
    const next = { ...current, ...config };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  },
  async selectAiFile() {
    return null;
  },
  async selectFontFile() {
    return null;
  },
  async getFileInfo() {
    return { ok: false, size: 0 };
  },
  async runSystemCheck() {
    await delay(500);
    return initialChecks.map((item) => ({
      id: item.id,
      status: item.id === 'font' || item.id === 'illustrator' ? 'warning' : 'passed',
    }));
  },
  async verifyLicense(payload) {
    await delay(500);
    return {
      ok: Boolean(payload.activationCode.trim()),
      message: '预览模式已完成激活流程模拟。',
      plan: 'lifetime',
      planLabel: '永久买断',
      expiresAt: null,
      licenseToken: 'preview-token',
      pointsBalance: 120,
    };
  },
  async redeemPoints(payload) {
    await delay(500);
    return {
      ok: Boolean(payload.redeemCode.trim()),
      message: '预览模式：点数码已兑换。',
      redeemedPoints: 50,
      pointsBalance: Number(payload.pointsBalance || 0) + 50,
    };
  },
  async runTask(payload) {
    await delay(1000);
    return {
      ok: true,
      output: payload.outputName,
      stats: { textFrames: 8677, translatedFrames: 4451, errors: 0 },
      logs: ['预览模式：任务接口已跑通。', '桌面版会调用 Illustrator 执行器完成 .ai 文件回写。'],
    };
  },
  onTaskProgress() {
    return () => {};
  },
  async openPath() {
    return false;
  },
  async revealPath() {
    return false;
  },
};

function getBridge() {
  return window.agentBridge ?? fallbackBridge;
}

export default function App() {
  const bridge = getBridge();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [licensed, setLicensed] = useState(false);
  const [isLicenseChecking, setIsLicenseChecking] = useState(false);
  const [account, setAccount] = useState<AccountState>({
    activationCode: '',
    licenseEndpoint: defaultLicenseEndpoint,
  });
  const [redeemCode, setRedeemCode] = useState('');
  const [checks, setChecks] = useState(initialChecks);
  const [isChecking, setIsChecking] = useState(false);
  const [task, setTask] = useState<TaskState>(initialTaskState);
  const [selectedFile, setSelectedFile] = useState('');
  const [sourceFileSize, setSourceFileSize] = useState(0);
  const [currentTask, setCurrentTask] = useState<CurrentTaskContext | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null);
  const [logs, setLogs] = useState<string[]>(['等待选择 Illustrator .ai 源文件。']);
  const [result, setResult] = useState<TaskResult | null>(null);

  const envReady = checks.every((item) => item.status === 'passed' || item.status === 'warning');
  const sourceName = useMemo(() => {
    const raw = task.sourcePath || selectedFile;
    return raw ? raw.split(/[\\/]/).pop() || raw : '';
  }, [selectedFile, task.sourcePath]);
  const outputName = task.outputName || (sourceName ? withChineseSuffix(sourceName) : '');
  const taskReady = Boolean(task.sourcePath || selectedFile);
  const translationRules = task.translationRules?.length ? task.translationRules : initialTranslationRules;
  const detectedGroups = taskReady ? detectedTextGroups : [];
  const translationScopeOptions = useMemo(() => {
    const detectedLabels = detectedGroups.map((group) => group.label);
    return [...new Set([...baseTranslationScopes, ...detectedLabels])];
  }, [detectedGroups]);
  const maxTranslationRules = taskReady ? Math.max(1, detectedGroups.length) : translationScopeOptions.length;
  const canAddTranslationRule = translationRules.length < maxTranslationRules;
  const failureMessage = !result?.ok ? result?.stderr || result?.message || '' : '';
  const requiredPoints = estimateTaskPoints({ taskReady, fileSize: sourceFileSize, rules: translationRules, detectedGroups });
  const canResumeCurrentTask = currentTask?.status === 'failed' && taskReady;
  const primaryActionLabel = getPrimaryActionLabel({ jobStatus, currentTaskStatus: currentTask?.status });

  useEffect(() => {
    bridge.loadConfig().then((config) => {
      let loadedAccount: AccountState | null = null;
      if (config.account) {
        loadedAccount = { ...config.account, activationCode: config.account.activationCode || '', licenseEndpoint: config.account.licenseEndpoint || defaultLicenseEndpoint };
        setAccount(loadedAccount);
      }
      if (config.task) {
        const savedTask = normalizeTaskConfig({ ...initialTaskState, ...config.task });
        setTask({ ...savedTask, sourcePath: '', outputName: '' });
      }
      if (config.licensed && loadedAccount && (loadedAccount.licenseToken || loadedAccount.activationCode)) {
        setLicensed(true);
        setIsLicenseChecking(true);
        bridge
          .verifyLicense({ ...loadedAccount, verifyOnly: true })
          .then((response) => {
            if (!response.ok) {
              setLicensed(false);
              bridge.saveConfig({ licensed: false }).catch(() => {});
              setLogs((current) => [formatLicenseFailure(response), ...current].slice(0, 80));
              return;
            }
            const verifiedAccount = mergeLicenseResponse(loadedAccount, response);
            setAccount(verifiedAccount);
            setLicensed(true);
            bridge.saveConfig({ account: verifiedAccount, licensed: true }).catch(() => {});
            setLogs((current) => [`授权已自动校验：${formatLicenseSummary(verifiedAccount)}`, ...current].slice(0, 80));
          })
          .catch(() => {
            setLogs((current) => ['暂时无法连接授权服务，已保留本机授权状态；请确认网络后继续使用。', ...current].slice(0, 80));
          })
          .finally(() => setIsLicenseChecking(false));
      }
    });
  }, []);

  useEffect(() => {
    const cleanup = bridge.onTaskProgress?.((event) => {
      setTaskProgress(event);
      if (typeof event.percent === 'number') {
        setProgress(Math.max(0, Math.min(100, event.percent)));
      }
      if (event.message) {
        setLogs((current) => [`${timestamp()} ${event.message}`, ...current].slice(0, 80));
      }
    });
    return cleanup;
  }, []);

  const persist = (config: AgentConfig) => {
    bridge.saveConfig(config).catch(() => {
      setLogs((current) => ['配置保存失败，请检查本地权限。', ...current]);
    });
  };

  const updateAccount = (field: keyof AccountState, value: string) => {
    setAccount((current) => {
      const next =
        field === 'activationCode'
          ? {
              ...current,
              activationCode: value,
              licenseToken: '',
              licenseId: '',
              plan: '',
              planLabel: '',
              expiresAt: undefined,
              pointsBalance: undefined,
              lastVerifiedAt: undefined,
            }
          : { ...current, [field]: value };
      persist({ account: next, ...(field === 'activationCode' ? { licensed: false } : {}) });
      if (field === 'activationCode') setLicensed(false);
      return next;
    });
  };

  const updateTask = <K extends keyof TaskState>(field: K, value: TaskState[K]) => {
    setTask((current) => {
      const next = { ...current, [field]: value };
      persist({ task: next });
      return next;
    });
  };

  const addTranslationRule = () => {
    if (!canAddTranslationRule) return;
    const usedSources = new Set(translationRules.map((rule) => rule.source));
    const nextSource = translationScopeOptions.find((option) => !usedSources.has(option)) || translationScopeOptions[0] || '简体中文';
    updateTask('translationRules', [...translationRules, { id: createTaskId(), source: nextSource, target: task.targetLang || '简体中文' }]);
  };

  const updateTranslationRule = (id: string, field: 'source' | 'target', value: string) => {
    updateTask('translationRules', translationRules.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule)));
  };

  const removeTranslationRule = (id: string) => {
    if (translationRules.length <= 1) return;
    updateTask('translationRules', translationRules.filter((rule) => rule.id !== id));
  };

  const getRuleSourceOptions = (ruleId: string) => {
    const usedByOtherRules = new Set(translationRules.filter((rule) => rule.id !== ruleId).map((rule) => rule.source));
    return translationScopeOptions.filter((option) => !usedByOtherRules.has(option));
  };

  const activateLicense = async () => {
    const response = await bridge.verifyLicense(account);
    if (!response.ok) {
      setLogs((current) => [formatLicenseFailure(response), ...current]);
      return;
    }
    const nextAccount = mergeLicenseResponse(account, response);
    setAccount(nextAccount);
    setLicensed(true);
    persist({ account: nextAccount, licensed: true });
    setLogs([`${response.message || '激活成功，当前设备已绑定。'} ${formatLicenseSummary(nextAccount)}`]);
    setModal(null);
  };

  const redeemPoints = async () => {
    if (!licensed) {
      setModal('activation');
      return;
    }
    const code = redeemCode.trim();
    if (!code) return;
    const response = await bridge.redeemPoints({ ...account, redeemCode: code });
    if (!response.ok) {
      setLogs((current) => [formatPointsFailure(response), ...current]);
      return;
    }
    const nextAccount = mergeLicenseResponse(account, response);
    setAccount(nextAccount);
    persist({ account: nextAccount, licensed: true });
    setRedeemCode('');
    setLogs((current) => [`点数码兑换成功：+${response.redeemedPoints || 0} 点，当前余额 ${formatPointsBalance(nextAccount)}。`, ...current].slice(0, 80));
    setModal(null);
  };

  const runEnvironmentCheck = async () => {
    setIsChecking(true);
    setChecks((items) => items.map((item) => ({ ...item, status: 'running' })));
    const statuses = await bridge.runSystemCheck();
    setChecks((items) =>
      items.map((item) => {
        const next = statuses.find((status) => status.id === item.id);
        return { ...item, status: next?.status ?? 'failed', detail: next?.detail ?? item.detail };
      }),
    );
    setIsChecking(false);
    setLogs((current) => ['执行检测完成。', ...current]);
  };

  const refreshAccountState = async (baseAccount: AccountState) => {
    const response = await bridge.verifyLicense({ ...baseAccount, verifyOnly: true });
    if (!response.ok) return baseAccount;
    const nextAccount = mergeLicenseResponse(baseAccount, response);
    setAccount(nextAccount);
    persist({ account: nextAccount, licensed: true });
    return nextAccount;
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file.name);
    setSourceFileSize(file.size || 0);
    setCurrentTask({ taskId: createTaskId(), sourcePath: file.name, status: 'idle' });
    setTaskProgress(null);
    setResult(null);
    setProgress(0);
    updateTask('sourceLang', defaultTranslationScope);
    updateTask('translationRules', initialTranslationRules);
    updateTask('outputName', withChineseSuffix(file.name));
    setLogs((current) => [`已选择文件：${file.name}`, ...current]);
  };

  const selectLocalFile = async () => {
    if (!window.agentBridge) {
      fileInputRef.current?.click();
      return;
    }
    const path = await bridge.selectAiFile();
    if (!path) return;
    updateTask('sourcePath', path);
    const fileName = path.split(/[\\/]/).pop() || 'catalog.ai';
    setSelectedFile('');
    const fileInfo = await bridge.getFileInfo(path);
    setSourceFileSize(fileInfo.ok ? Number(fileInfo.size || 0) : 0);
    setCurrentTask({ taskId: createTaskId(), sourcePath: path, status: 'idle' });
    setTaskProgress(null);
    setResult(null);
    setProgress(0);
    updateTask('sourceLang', defaultTranslationScope);
    updateTask('translationRules', initialTranslationRules);
    updateTask('outputName', withChineseSuffix(fileName));
    setLogs((current) => [`已选择文件：${path}`, ...current]);
  };

  const selectFontFile = async () => {
    const path = await bridge.selectFontFile();
    if (!path) return;
    const fileName = path.split(/[\\/]/).pop() || path;
    setTask((current) => {
      const next = { ...current, fontPath: path, fontName: fileName };
      persist({ task: next });
      return next;
    });
    setLogs((current) => [`已选择输出字体：${fileName}`, ...current]);
  };

  const clearFontFile = () => {
    setTask((current) => {
      const next = { ...current, fontPath: '', fontName: '' };
      persist({ task: next });
      return next;
    });
    setLogs((current) => ['已恢复默认输出字体。', ...current]);
  };

  const closeCurrentTask = () => {
    if (
      currentTask &&
      !window.confirm('关闭后，当前任务进度不会再用于续跑。再次选择文件会创建新任务，确认关闭吗？')
    ) {
      return;
    }
    setSelectedFile('');
    setSourceFileSize(0);
    setCurrentTask(null);
    setTask(initialTaskState);
    setTaskProgress(null);
    setResult(null);
    setProgress(0);
    setJobStatus('idle');
    persist({ task: initialTaskState });
    setLogs(['当前任务已关闭。再次选择文件将创建新任务。']);
  };

  const startRun = async () => {
    if (!licensed) {
      setModal('activation');
      return;
    }
    if (!envReady) {
      await runEnvironmentCheck();
      return;
    }
    if (!taskReady) {
      setLogs((current) => ['请先选择 Illustrator .ai 源文件。', ...current]);
      return;
    }

    const activeTask =
      currentTask && currentTask.sourcePath === (task.sourcePath || selectedFile)
        ? currentTask
        : { taskId: createTaskId(), sourcePath: task.sourcePath || selectedFile, status: 'idle' as const };
    const pointsBalance = Number(account.pointsBalance || 0);
    if (pointsBalance < requiredPoints) {
      setLogs((current) => [`点数余额不足，本次任务预计需要 ${requiredPoints} 点。请先兑换点数码。`, ...current].slice(0, 80));
      setModal('points');
      return;
    }
    if (!window.confirm(`本次任务预计消耗 ${requiredPoints} 点。确认开始处理吗？`)) {
      return;
    }
    setCurrentTask({ ...activeTask, status: 'running' });
    const payload = { ...task, outputName, selectedFile, account, requiredPoints, currentTask: activeTask };
    setJobStatus('running');
    setProgress(3);
    setTaskProgress({ stage: 'queued', message: '任务已提交到本地执行器。', percent: 3 });
    setResult(null);
    setLogs([`${timestamp()} 任务已提交到本地执行器。`]);

    let response: TaskResult;
    try {
      response = await bridge.runTask(payload);
    } catch (error) {
      response = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    setResult(response);
    await refreshAccountState(account).catch(() => account);
    setProgress(response.ok ? 100 : 0);
    setJobStatus('done');
    if (!response.ok) {
      const readableError = humanizeTaskFailure(response.stderr || response.message);
      if (isPointBalanceFailure(response.stderr || response.message)) setModal('points');
      setTaskProgress({
        stage: 'failed',
        message: '任务失败，当前任务进度已保留。重新点击继续翻译，将继续当前任务。',
        percent: 0,
      });
      setResult({ ...response, message: readableError, stderr: readableError });
    }
    setCurrentTask((current) =>
      current
        ? {
            ...current,
            status: response.ok ? 'completed' : 'failed',
            runDir: response.taskReport?.runDir || current.runDir,
          }
        : current,
    );
    const readableError = humanizeTaskFailure(response.stderr || response.message);
    setLogs([
      ...(response.logs ?? []),
      response.ok
        ? `${timestamp()} 任务完成。`
        : `${timestamp()} 任务失败：${readableError} 当前任务进度已保留，可直接继续。`,
    ]);
  };

  const openOutputFile = () => {
    if (result?.output) bridge.openPath(result.output);
  };

  const revealOutputFile = () => {
    if (result?.output) bridge.revealPath(result.output);
  };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-950 text-white">
              <FileOutput size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">AI Catalog Agent</h1>
              <p className="text-sm text-slate-500">
                专注 Illustrator .ai 文件，在不破坏图层、素材和原有排版的基础上完成翻译；一键提效，但建议按 AI 辅助、人工审校、最终输出的流程使用。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill active={licensed && Number(account.pointsBalance || 0) > 0} activeText={`点数 ${formatPointsBalance(account)}`} inactiveText={licensed ? '点数 0' : '未激活'} icon={BadgeCheck} onClick={() => setModal(licensed ? 'points' : 'activation')} />
            <StatusPill active={licensed} activeText={getLicensePillText(account)} inactiveText={isLicenseChecking ? '校验中' : '未激活'} icon={licensed ? UnlockKeyhole : Lock} onClick={() => setModal('activation')} loading={isLicenseChecking} />
            <StatusPill active={envReady} activeText="可执行" inactiveText="待检测" icon={MonitorCheck} onClick={runEnvironmentCheck} loading={isChecking} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-5">
          <Panel title="选择 Illustrator .ai 源文件" icon={FileText}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
              <div className="rounded border border-slate-200 bg-slate-50 p-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Source File</div>
                <div className="truncate text-base font-semibold text-slate-950">{task.sourcePath || selectedFile || '尚未选择 .ai 文件'}</div>
                <div className="mt-2 text-sm text-slate-500">{taskReady ? 'AI 文件已就绪，任务会在本机通过 Illustrator 处理。' : '选择需要翻译的 .ai 源文件，Agent 会尽量保持图层、素材、版式和可编辑结构。'}</div>
                {currentTask && (
                  <div className="mt-3 inline-flex rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    当前任务：{getCurrentTaskLabel(currentTask.status)}
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-center gap-2">
                <button onClick={selectLocalFile} className="inline-flex h-11 items-center justify-center gap-2 rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
                  <FolderOpen size={17} />
                  选择文件
                </button>
                {taskReady && (
                  <button onClick={closeCurrentTask} disabled={jobStatus === 'running'} className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                    <X size={16} />
                    关闭任务
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept={acceptedExtensions} onChange={chooseFile} className="hidden" />
                <div className="text-center text-xs text-slate-500">单文件任务</div>
              </div>
            </div>
          </Panel>

          <Panel title="文字类型与转换规则" icon={Languages}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-3">
                <div className="flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{taskReady ? '已完成文字类型扫描' : '等待上传文件后扫描'}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {taskReady ? '根据检测到的语言添加转换规则。多语种混排只作为风险提示，不作为可选范围。' : '上传 .ai 后会先读取可编辑文本，再显示检测到的文字类型。'}
                    </div>
                  </div>
                  <div className="inline-flex h-9 items-center gap-2 rounded border border-slate-200 bg-white px-3 text-sm text-slate-700">
                    <ListFilter size={16} />
                    {taskReady ? `${detectedGroups.length} 种语言` : '未扫描'}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {(taskReady ? detectedGroups : detectedTextGroups).map((group) => (
                    <div
                      key={group.id}
                      className={`min-h-[156px] rounded border border-slate-200 p-3 ${taskReady ? 'bg-white' : 'bg-slate-50 opacity-60'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-950">{group.label}</div>
                        <div className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{group.textFrames} 框</div>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">{group.detail}</div>
                      <div className="mt-3 space-y-1">
                        {group.samples.slice(0, 2).map((sample) => (
                          <div key={sample} className="truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            {sample}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {taskReady && (
                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    <span className="font-semibold">检测到 {mixedTextNotice.textFrames} 个多语种混排文本框。</span>
                    <span> AI 会自行处理这些混排内容；在下方“术语保护”中填写品牌、型号、产品名和必须保留的专业术语，可以让处理结果更准确。</span>
                  </div>
                )}
              </div>

              <div className="rounded border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">转换规则</div>
                    <div className="mt-1 text-xs text-slate-500">
                      每条规则独立设置，最多 {maxTranslationRules} 条。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addTranslationRule}
                    disabled={!canAddTranslationRule}
                    className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <Plus size={15} />
                    添加
                  </button>
                </div>
                {!canAddTranslationRule && (
                  <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    已覆盖全部检测语言；如需新增规则，请先删除一条现有规则。
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {translationRules.map((rule, index) => (
                    <div key={rule.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-600">规则 {index + 1}</div>
                        <button
                          type="button"
                          onClick={() => removeTranslationRule(rule.id)}
                          disabled={translationRules.length === 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          title="删除规则"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SelectField label="将文件中" value={rule.source} options={getRuleSourceOptions(rule.id)} onChange={(value) => updateTranslationRule(rule.id, 'source', value)} />
                        <SelectField label="替换为" value={rule.target} options={targetLanguages} onChange={(value) => updateTranslationRule(rule.id, 'target', value)} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                  <div className="font-semibold">当前规则摘要</div>
                  <div className="mt-1 space-y-1">
                    {translationRules.map((rule) => (
                      <div key={`${rule.id}-summary`}>
                        {rule.source} → {rule.target}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="输出设置" icon={FileOutput}>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="输出文件名" value={outputName} onChange={(value) => updateTask('outputName', value)} placeholder="catalog_中文.ai" />
              <SelectField label="输出位置" value={task.outputLocation} options={outputLocations} onChange={(value) => updateTask('outputLocation', value)} />
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700">输出字体</span>
                <button onClick={selectFontFile} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <FileText size={16} />
                  {task.fontName || '上传字体'}
                </button>
                {task.fontPath ? (
                  <button onClick={clearFontFile} className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-950">
                    清除字体
                  </button>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">不上传则使用默认字体</div>
                )}
              </div>
            </div>
            {task.outputLocation === '自定义路径' && (
              <div className="mt-4">
                <Field label="自定义输出路径" value={task.outputCustomPath} onChange={(value) => updateTask('outputCustomPath', value)} placeholder="例如：D:\\Translated Files" />
              </div>
            )}
          </Panel>

          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                术语保护
                <span className="group relative inline-flex">
                  <CircleHelp size={16} className="text-slate-400" />
                  <span className="pointer-events-none absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded border border-slate-200 bg-slate-950 px-3 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                    可填写品牌名、行业专业术语、产品信息等关键内容，帮助 AI 保持译名和表达一致，提升翻译准确率。此项非必填，填写后效果更好。
                  </span>
                </span>
              </span>
            }
            icon={ClipboardCheck}
          >
            <textarea
              value={task.glossary}
              onChange={(event) => updateTask('glossary', event.target.value)}
              rows={6}
              className="w-full resize-none rounded border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-slate-950"
            />
          </Panel>

          <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950">{canResumeCurrentTask ? '继续当前任务' : '开始翻译任务'}</div>
              <div className="mt-1 text-sm text-slate-500">
                {canResumeCurrentTask ? '当前任务进度已保留，继续时会优先复用已完成翻译。' : getStartHint({ licensed, envReady, taskReady })}
              </div>
              {taskReady && (
                <div className="mt-2 text-xs text-slate-500">
                  预计消耗 <span className="font-semibold text-slate-950">{requiredPoints}</span> 点，当前余额 <span className="font-semibold text-slate-950">{formatPointsBalance(account)}</span> 点。
                </div>
              )}
            </div>
            <button onClick={startRun} disabled={jobStatus === 'running'} className="inline-flex h-12 items-center justify-center gap-2 rounded bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {jobStatus === 'running' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              {primaryActionLabel}
              <ChevronRight size={18} />
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <Panel title="任务状态" icon={TerminalSquare} compact>
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{jobStatus === 'running' ? '正在执行' : jobStatus === 'done' ? '任务结束' : '等待开始'}</span>
                <span className="text-slate-500">{progress}%</span>
              </div>
              <div className="h-2 rounded bg-slate-200">
                <div className="h-2 rounded bg-slate-950 transition-all" style={{ width: `${progress}%` }} />
              </div>
              {currentTask?.status === 'failed' && (
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  <div className="font-semibold">任务失败，当前任务进度已保留</div>
                  <div className="mt-1">重新点击“继续翻译”会继续当前任务；点击“关闭任务”后，本次进度不再用于续跑。</div>
                  {failureMessage && <div className="mt-1 break-all text-amber-700">失败原因：{failureMessage}</div>}
                </div>
              )}
              {taskProgress && (
                <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  <div className="font-medium text-slate-800">{taskProgress.message}</div>
                  {typeof taskProgress.current === 'number' && typeof taskProgress.total === 'number' && (
                    <div className="mt-1">
                      进度：{taskProgress.current}/{taskProgress.total}
                      {taskProgress.batches ? `，批次：${taskProgress.batch || 0}/${taskProgress.batches}` : ''}
                      {typeof taskProgress.checkpointHits === 'number' ? `，续跑复用：${taskProgress.checkpointHits}` : ''}
                      {typeof taskProgress.cacheHits === 'number' ? `，缓存命中：${taskProgress.cacheHits}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
            <LogPanel logs={logs} />
          </Panel>

          <Panel title="结果报告" icon={ClipboardCheck} compact>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="文本框" value={result?.stats?.textFrames ? String(result.stats.textFrames) : '--'} />
              <Metric label="已翻译" value={result?.stats?.translatedFrames ? String(result.stats.translatedFrames) : '--'} />
              <Metric label="续跑复用" value={result?.taskReport ? String(result.taskReport.checkpointHits ?? 0) : '--'} />
              <Metric label="模型请求" value={result?.taskReport ? String(result.taskReport.modelRequests ?? 0) : '--'} />
            </div>
            {result?.taskReport && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="rounded border border-slate-200 bg-white px-3 py-2">缓存命中：{result.taskReport.cacheHits ?? 0}</div>
                <div className="rounded border border-slate-200 bg-white px-3 py-2">错误数量：{result.stats?.errors ?? 0}</div>
              </div>
            )}
            <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="mb-1 font-medium text-slate-800">输出文件</div>
              <div className="break-all text-slate-600">{result?.ok ? result.output || outputName : '任务完成后生成'}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={openOutputFile} disabled={!result?.ok || !result.output} className="inline-flex h-10 items-center justify-center rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                打开文件
              </button>
              <button onClick={revealOutputFile} disabled={!result?.ok || !result.output} className="inline-flex h-10 items-center justify-center rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                打开目录
              </button>
            </div>
          </Panel>
        </aside>
      </div>

      {modal === 'activation' && (
        <Modal title="激活 Agent" icon={ShieldCheck} onClose={() => setModal(null)}>
          <Field label="激活码" value={account.activationCode} onChange={(value) => updateAccount('activationCode', value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" />
          <p className="mt-3 text-sm text-slate-500">当前激活码会绑定本机设备。绑定后不可在其他设备重复使用，如需更换设备请联系售后。</p>
          {licensed && <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{formatLicenseSummary(account)}</p>}
          {licensed && getExpiryWarning(account) && <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{getExpiryWarning(account)}</p>}
          {!licensed && <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">如授权到期，请输入新的月卡、年卡或永久激活码重新激活。</p>}
          <ModalActions primaryLabel="激活当前设备" onPrimary={activateLicense} disabled={!account.activationCode.trim()} />
        </Modal>
      )}

      {modal === 'points' && (
        <Modal title="兑换点数码" icon={BadgeCheck} onClose={() => setModal(null)}>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            当前点数余额：<span className="font-semibold text-slate-950">{formatPointsBalance(account)}</span>
          </div>
          <div className="mt-4">
            <Field label="点数码" value={redeemCode} onChange={setRedeemCode} placeholder="输入购买后收到的点数码" />
          </div>
          <p className="mt-3 text-sm text-slate-500">点数码会绑定到当前已激活设备，用于后续文件处理任务扣点。</p>
          <ModalActions primaryLabel="兑换点数" onPrimary={redeemPoints} disabled={!licensed || !redeemCode.trim()} />
        </Modal>
      )}

    </main>
  );
}

function Panel({ title, icon: Icon, children, compact = false }: { title: React.ReactNode; icon: React.ElementType; children: React.ReactNode; compact?: boolean }) {
  return (
    <section className="rounded border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Icon size={18} className="text-slate-700" />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className={compact ? 'p-4' : 'p-5'}>{children}</div>
    </section>
  );
}

function Modal({ title, icon: Icon, children, onClose }: { title: string; icon: React.ElementType; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4">
      <section className="w-full max-w-lg rounded border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon size={18} />
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded hover:bg-slate-100">
            <X size={17} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function ModalActions({ primaryLabel, onPrimary, disabled = false }: { primaryLabel: string; onPrimary: () => void; disabled?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
      <button onClick={onPrimary} disabled={disabled} className="inline-flex h-10 items-center justify-center rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
        {primaryLabel}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input value={value} type={type} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950 disabled:bg-slate-100 disabled:text-slate-500" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function LogPanel({ logs }: { logs: string[] }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-950 p-3 text-sm text-slate-100">
      <div className="max-h-56 space-y-2 overflow-auto">
        {logs.map((line, index) => (
          <div key={`${line}-${index}`} className="font-mono text-xs leading-5 text-slate-200">{line}</div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ active, activeText, inactiveText, icon: Icon, onClick, loading = false }: { active: boolean; activeText: string; inactiveText: string; icon: React.ElementType; onClick?: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-sm ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {active ? activeText : inactiveText}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function getStartHint({ licensed, envReady, taskReady }: { licensed: boolean; envReady: boolean; taskReady: boolean }) {
  if (!licensed) return '点击开始后会先要求输入激活码。';
  if (!envReady) return '点击开始后会先执行本机能力检测。';
  if (!taskReady) return '请选择一个 Illustrator .ai 源文件。';
  return '条件已满足，可以开始翻译。';
}

function mergeLicenseResponse(account: AccountState, response: LicenseResponse): AccountState {
  return {
    ...account,
    licenseToken: response.licenseToken || account.licenseToken,
    licenseId: response.licenseId || account.licenseId,
    plan: response.plan || account.plan,
    planLabel: response.planLabel || account.planLabel,
    expiresAt: response.expiresAt === undefined ? account.expiresAt : response.expiresAt,
    pointsBalance: response.pointsBalance === undefined ? account.pointsBalance : response.pointsBalance,
    lastVerifiedAt: new Date().toISOString(),
  };
}

function formatPointsBalance(account: AccountState) {
  return String(Math.max(0, Number(account.pointsBalance || 0)));
}

function estimateTaskPoints({ taskReady, fileSize, rules, detectedGroups }: { taskReady: boolean; fileSize: number; rules: TranslationRule[]; detectedGroups: DetectedTextGroup[] }) {
  if (!taskReady) return 0;
  const detectedCharacters = detectedGroups.reduce((total, group) => total + group.characters, 0);
  const fileWeight = Math.ceil(Math.max(0, Number(fileSize || 0)) / (18 * 1024 * 1024));
  const textWeight = Math.ceil((detectedCharacters * Math.max(1, rules.length)) / 5000);
  return Math.max(1, fileWeight, textWeight);
}

function getLicensePillText(account: AccountState) {
  const warning = getExpiryWarning(account);
  if (warning) return warning.includes('已到期') ? '授权已到期' : '即将到期';
  if (account.plan === 'monthly') return '月卡有效';
  if (account.plan === 'yearly') return '年卡有效';
  if (account.plan === 'lifetime' || account.plan === 'standard') return '永久有效';
  return '已激活';
}

function formatLicenseSummary(account: AccountState) {
  const plan = account.planLabel || getLicensePillText(account);
  if (!account.expiresAt) return `${plan}，永久有效`;
  const date = new Date(account.expiresAt);
  const formatted = Number.isNaN(date.getTime()) ? account.expiresAt : date.toLocaleDateString('zh-CN');
  return `${plan}，有效期至 ${formatted}`;
}

function getExpiryWarning(account: AccountState) {
  if (!account.expiresAt) return '';
  const expiresAt = Date.parse(account.expiresAt);
  if (Number.isNaN(expiresAt)) return '';
  const diffDays = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return '授权已到期，请输入新的激活码。';
  if (diffDays <= 7) return `授权将在 ${diffDays} 天内到期，请及时续费获取新激活码。`;
  return '';
}

function formatLicenseFailure(response: LicenseResponse) {
  if (response.reason === 'CODE_EXPIRED') return '授权已到期，请输入新的激活码。';
  if (response.reason === 'DEVICE_MISMATCH') return '该激活码已在其他设备上重新激活。如需继续使用，请重新输入有效激活码。';
  return response.message || '授权校验失败，请重新激活或联系售后。';
}

function formatPointsFailure(response: LicenseResponse) {
  if (response.reason === 'LICENSE_NOT_FOUND') return '请先完成激活，再兑换点数码。';
  if (response.reason === 'CODE_REDEEMED') return '该点数码已被使用。';
  if (response.reason === 'CODE_EXPIRED') return '该点数码已过期。';
  if (response.reason === 'NO_POINTS') return '该兑换码不包含可用点数。';
  return response.message || '点数码兑换失败，请检查后重新输入。';
}

function getPrimaryActionLabel({ jobStatus, currentTaskStatus }: { jobStatus: JobStatus; currentTaskStatus?: CurrentTaskContext['status'] }) {
  if (jobStatus === 'running') return '正在执行';
  if (currentTaskStatus === 'failed') return '继续翻译';
  if (currentTaskStatus === 'completed') return '重新生成';
  return '开始翻译';
}

function humanizeTaskFailure(message = '') {
  const text = String(message || '').trim();
  if (!text) return '任务未完成，请检查文件、服务状态或网络状态。';
  if (isPointBalanceFailure(text)) {
    return '点数余额不足，请先兑换点数码后继续当前任务。';
  }
  if (/API Key|apiKey|401|403|unauthorized|forbidden/i.test(text)) {
    return '模型服务暂时不可用，请联系维护者检查服务配置后继续当前任务。';
  }
  if (/timeout|超时|AbortError/i.test(text)) {
    return '模型服务响应超时，请检查网络后直接继续当前任务。';
  }
  if (/quota|余额|insufficient|limit|429/i.test(text)) {
    return '模型服务繁忙或额度不足，请稍后继续当前任务；如果反复出现，请联系维护者。';
  }
  if (/Illustrator|ComObject|DoJavaScript|无法.*Illustrator/i.test(text)) {
    return 'Illustrator 执行失败，请确认 Illustrator 已正确安装并可正常打开该文件。';
  }
  if (/JSON|Unexpected end/i.test(text)) {
    return '模型服务返回异常，请稍后直接继续当前任务。';
  }
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function isPointBalanceFailure(message = '') {
  return /INSUFFICIENT_POINTS|点数余额不足|pointsBalance|requiredPoints/i.test(String(message || ''));
}

function withChineseSuffix(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return `${fileName}_中文`;
  return `${fileName.slice(0, dotIndex)}_中文${fileName.slice(dotIndex)}`;
}

function createTaskId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${randomPart}`;
}

function getCurrentTaskLabel(status: CurrentTaskContext['status']) {
  if (status === 'running') return '执行中';
  if (status === 'failed') return '失败后可直接重试';
  if (status === 'completed') return '已完成';
  return '未开始';
}

function normalizeTaskConfig(task: TaskState): TaskState {
  const sourceName = task.sourcePath ? task.sourcePath.split(/[\\/]/).pop() || '' : '';
  const outputName = hasMojibake(task.outputName) ? (sourceName ? withChineseSuffix(sourceName) : '') : task.outputName;
  return {
    ...task,
    outputName,
    outputLocation: outputLocations.includes(task.outputLocation) ? task.outputLocation : '源文件同目录',
    sourceLang: hasMojibake(task.sourceLang) || !task.sourceLang ? defaultTranslationScope : task.sourceLang,
    targetLang: targetLanguages.includes(task.targetLang) ? task.targetLang : '简体中文',
    translationRules: normalizeTranslationRules(task.translationRules),
  };
}

function normalizeTranslationRules(rules: TranslationRule[] | undefined): TranslationRule[] {
  if (!Array.isArray(rules) || rules.length === 0) return initialTranslationRules;
  const usedSources = new Set<string>();
  const normalized = rules
    .map((rule, index) => ({
      id: rule.id || `rule-${index + 1}`,
      source: baseTranslationScopes.includes(rule.source) ? rule.source : initialTranslationRules[0].source,
      target: targetLanguages.includes(rule.target) ? rule.target : initialTranslationRules[0].target,
    }))
    .filter((rule) => {
      if (usedSources.has(rule.source)) return false;
      usedSources.add(rule.source);
      return true;
    });
  return normalized.length ? normalized : initialTranslationRules;
}

function hasMojibake(value: string) {
  return /[绠绻閫鎵鏂婧浠宸鐢璇妯鎺杈缈寰澶]/.test(value || '');
}

function timestamp() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
