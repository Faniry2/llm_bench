import React, { useRef } from 'react';
import { useRunStore } from '../store/useRunStore.js';

export default function PromptEditor(): React.ReactElement {
  const prompt = useRunStore((s) => s.prompt);
  const setPrompt = useRunStore((s) => s.setPrompt);
  const templates = useRunStore((s) => s.templates);
  const selectedTemplateId = useRunStore((s) => s.selectedTemplateId);
  const selectTemplate = useRunStore((s) => s.selectTemplate);
  const clearPrompt = useRunStore((s) => s.clearPrompt);
  const detectedVariableNames = useRunStore((s) => s.detectedVariableNames);
  const variables = useRunStore((s) => s.variables);
  const setVariable = useRunStore((s) => s.setVariable);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function saveAsTemplate() {
    const blob = new Blob([prompt], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPrompt(String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-300">Prompt</h2>
          <select
            className="input py-1 text-xs"
            value={selectedTemplateId}
            onChange={(e) => {
              if (e.target.value) selectTemplate(e.target.value);
            }}
            title="Choisir un modèle de prompt"
          >
            {selectedTemplateId === '' && <option value="">— Personnalisé —</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-sm" onClick={clearPrompt} title="Repartir d'un prompt vide">
            ✏️ Nouveau
          </button>
          <button className="btn-sm" onClick={() => fileInputRef.current?.click()}>
            📂 Charger un fichier
          </button>
          <input ref={fileInputRef} type="file" accept=".md,.txt" className="hidden" onChange={onFileChosen} />
          <button className="btn-sm" onClick={saveAsTemplate}>
            💾 Enregistrer
          </button>
        </div>
      </div>

      <textarea
        className="input mono h-56 resize-y leading-relaxed"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        spellCheck={false}
        placeholder="Écris ton prompt ici, utilise {{nom_variable}} pour les variables…"
      />

      {detectedVariableNames.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Variables</h3>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {detectedVariableNames.map((name) => (
              <label key={name} className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">{`{{${name}}}`}</span>
                <input
                  className="input"
                  value={variables[name] ?? ''}
                  onChange={(e) => setVariable(name, e.target.value)}
                  placeholder={name}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
