import React, { useState } from 'react';
import { useRunStore, PROVIDER_IDS } from '../store/useRunStore.js';
import type { ProviderId } from '../../providers/types.js';

const LABELS: Record<ProviderId, string> = {
  deepseek: 'DeepSeek V4 Pro',
  qwen: 'Qwen 3.7 Plus',
  kimi: 'Kimi K2.6',
  glm: 'GLM-5.1'
};

const ENV_VARS: Record<ProviderId, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  glm: 'ZAI_API_KEY'
};

const PLATFORM_HINTS: Record<ProviderId, string> = {
  deepseek: 'DeepSeek Platform (platform.deepseek.com)',
  qwen: 'Alibaba Cloud Model Studio / DashScope (dashscope.console.aliyun.com)',
  kimi: 'Moonshot AI Platform (platform.moonshot.ai)',
  glm: 'Z.ai Open Platform (z.ai)'
};

export default function ApiKeysPanel(): React.ReactElement {
  const keysPresent = useRunStore((s) => s.keysPresent);
  const setApiKey = useRunStore((s) => s.setApiKey);
  const testApiKey = useRunStore((s) => s.testApiKey);
  const [inputs, setInputs] = useState<Partial<Record<ProviderId, string>>>({});
  const [testResult, setTestResult] = useState<Partial<Record<ProviderId, 'ok' | 'fail' | 'testing'>>>({});

  async function handleTest(id: ProviderId) {
    setTestResult((s) => ({ ...s, [id]: 'testing' }));
    const ok = await testApiKey(id);
    setTestResult((s) => ({ ...s, [id]: ok ? 'ok' : 'fail' }));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Clés API</h2>
      <p className="text-xs text-slate-500">
        Les clés sont chiffrées via <code className="mono">safeStorage</code> (DPAPI Windows) avant d’être stockées localement.
        Elles ne quittent jamais le process principal.
      </p>

      {PROVIDER_IDS.map((id) => (
        <div key={id} className="card p-3">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-medium">{LABELS[id]}</h3>
            <span className={keysPresent[id] ? 'text-emerald-400' : 'text-slate-500'}>{keysPresent[id] ? '✅ configurée' : '— non configurée'}</span>
          </div>
          <p className="mb-2 text-[11px] text-slate-500">{PLATFORM_HINTS[id]}</p>
          <div className="flex gap-2">
            <input
              type="password"
              className="input"
              placeholder={`Variable d'env de secours : ${ENV_VARS[id]}`}
              value={inputs[id] ?? ''}
              onChange={(e) => setInputs((s) => ({ ...s, [id]: e.target.value }))}
            />
            <button
              className="btn-sm"
              onClick={async () => {
                await setApiKey(id, inputs[id] ?? '');
                setInputs((s) => ({ ...s, [id]: '' }));
              }}
            >
              Enregistrer
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button className="btn-sm" onClick={() => handleTest(id)}>
              Tester
            </button>
            {testResult[id] === 'testing' && <span className="text-xs text-slate-500">…</span>}
            {testResult[id] === 'ok' && <span className="text-xs text-emerald-400">✅ Valide</span>}
            {testResult[id] === 'fail' && <span className="text-xs text-red-400">❌ Échec</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
