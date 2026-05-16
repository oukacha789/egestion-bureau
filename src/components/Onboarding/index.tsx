import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Loader2, Check, X, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';

type Phase = 'idle' | 'indexing' | 'analyzing' | 'suggestions' | 'done';

interface SuggestedRule {
  condition_type: string;
  condition_value: string;
  target_dir: string;
  label: string;
}

interface OnboardingAnalysis {
  file_summary: string;
  suggested_rules: SuggestedRule[];
}

export function OnboardingScreen() {
  const { setWatchedDirs } = useAppStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [addedDir, setAddedDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<OnboardingAnalysis | null>(null);
  const [dismissedIndices, setDismissedIndices] = useState<Set<number>>(new Set());
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState(false);

  async function startAnalysis() {
    setPhase('analyzing');
    try {
      const result = await invoke<OnboardingAnalysis>('analyze_for_onboarding');
      setAnalysis(result);
    } catch {
      setAnalysis({ file_summary: '', suggested_rules: [] });
    }
    setPhase('suggestions');
  }

  async function handleAddFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choisir un dossier à surveiller',
    });
    if (!selected || typeof selected !== 'string') return;

    setLoading(true);
    try {
      const updated = await invoke<string[]>('add_watch_dir', { dir: selected });
      setWatchedDirs(updated);
      setAddedDir(selected);
      setPhase('indexing');
      setTimeout(startAnalysis, 2000);
    } catch (err) {
      console.error('add_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptRule(rule: SuggestedRule, index: number) {
    try {
      await invoke('create_rule', {
        name: rule.label,
        conditionType: rule.condition_type,
        conditionValue: rule.condition_value,
        targetDir: rule.target_dir,
        autoTag: null as null,
      });
      setAcceptedIndices((prev) => new Set([...prev, index]));
    } catch (err) {
      console.error('create_rule error:', err);
    }
  }

  async function handleAcceptAll() {
    if (!analysis) return;
    setCompleting(true);
    for (const [i, rule] of analysis.suggested_rules.entries()) {
      if (!dismissedIndices.has(i) && !acceptedIndices.has(i)) {
        await handleAcceptRule(rule, i);
      }
    }
    setCompleting(false);
    setPhase('done');
  }

  // ─── Phase: done ──────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Check size={28} className="text-emerald-400" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">Egestion est configuré !</p>
          <p className="text-xs text-zinc-500">
            Utilisez la barre latérale pour explorer vos fichiers.
          </p>
        </div>
      </div>
    );
  }

  // ─── Phase: suggestions ───────────────────────────────────────────────────
  if (phase === 'suggestions') {
    const rules = analysis?.suggested_rules ?? [];
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-amber-400" />
            <h1 className="text-sm font-semibold text-zinc-100">Analyse terminée</h1>
          </div>
          {analysis?.file_summary && (
            <p className="text-xs text-zinc-500">{analysis.file_summary}</p>
          )}
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">
          {rules.length > 0 ? (
            <>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-3">
                  Règles suggérées pour votre profil
                </p>
                <div className="flex flex-col gap-2">
                  {rules.map((rule, i) => {
                    if (dismissedIndices.has(i)) return null;
                    const accepted = acceptedIndices.has(i);
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                          accepted
                            ? 'bg-emerald-900/20 border-emerald-700/40'
                            : 'bg-zinc-900 border-zinc-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{rule.label}</p>
                          <p className="text-xs text-zinc-600">
                            .{rule.condition_value} → {rule.target_dir}
                          </p>
                        </div>
                        {accepted ? (
                          <Check size={14} className="text-emerald-400 shrink-0" />
                        ) : (
                          <>
                            <button
                              onClick={() => handleAcceptRule(rule, i)}
                              className="px-3 py-1 text-xs bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 rounded-lg transition-colors"
                            >
                              Accepter
                            </button>
                            <button
                              onClick={() =>
                                setDismissedIndices((prev) => new Set([...prev, i]))
                              }
                              className="p-1 text-zinc-600 hover:text-zinc-400"
                            >
                              <X size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAcceptAll}
                  disabled={completing}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
                >
                  {completing ? 'Application…' : 'Accepter toutes les règles'}
                </button>
                <button
                  onClick={() => setPhase('done')}
                  className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Commencer sans règles
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
              <p className="text-sm text-zinc-400">
                {analysis?.file_summary
                  ? 'Aucune règle suggérée pour ces fichiers.'
                  : 'Analyse indisponible — configurez une clé API Anthropic dans les Préférences.'}
              </p>
              <p className="text-xs text-zinc-600">
                Vous pouvez créer des règles manuellement dans l'onglet Règles.
              </p>
              <button
                onClick={() => setPhase('done')}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 rounded-lg transition-colors"
              >
                Commencer
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Phase: analyzing ─────────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Sparkles size={28} className="text-amber-400 animate-pulse" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">
            Analyse de vos fichiers en cours…
          </p>
          <p className="text-xs text-zinc-500">
            Claude examine vos types de fichiers pour personnaliser Egestion.
          </p>
        </div>
      </div>
    );
  }

  // ─── Phase: indexing ──────────────────────────────────────────────────────
  if (phase === 'indexing') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Loader2 size={28} className="text-amber-400 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">
            Egestion surveille votre dossier…
          </p>
          <p className="text-xs text-zinc-500">
            Les fichiers seront détectés et classés automatiquement.
          </p>
        </div>
        {addedDir && (
          <p className="text-[10px] text-zinc-600 font-mono truncate max-w-xs">{addedDir}</p>
        )}
      </div>
    );
  }

  // ─── Phase: idle ──────────────────────────────────────────────────────────
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex gap-10 max-w-lg w-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-900/20 border border-amber-700/30 flex items-center justify-center">
            <FolderOpen size={24} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100 mb-1">Aucun fichier indexé</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Ajoute un dossier à surveiller
              <br />
              pour commencer.
            </p>
          </div>
          <button
            onClick={handleAddFolder}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : '+'}
            Ajouter un dossier
          </button>
        </div>

        <div className="w-px bg-zinc-800 self-stretch" />

        <div className="flex-1 flex flex-col justify-center gap-3">
          <p className="text-[10px] font-medium tracking-widest uppercase text-zinc-600 mb-1">
            Ce que tu pourras faire
          </p>
          {[
            { icon: '🔍', label: 'Recherche instantanée' },
            { icon: '🏷', label: 'Tags automatiques' },
            { icon: '📊', label: 'Organisation intelligente' },
            { icon: '🗂', label: 'Détection de doublons' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-base">{icon}</span>
              <span className="text-xs text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
