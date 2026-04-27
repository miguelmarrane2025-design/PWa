// pages/TrainingPage.jsx
// Área de treinamento dos agentes: feedback, exemplos bons/ruins, uso de tokens.

import React, { useState, useEffect, useCallback } from 'react';
import { agentsApi, catalogApi, skillsApi, trainingApi } from '../services/api.js';
import { Brain, ThumbsUp, ThumbsDown, Zap, RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

const EMPTY_CATALOG = [];

const BAD_REASONS = [
  'genérico',
  'pouco relacionado ao tema',
  'imagem abstrata demais',
  'não parece real',
  'faltou composição',
  'título ruim',
  'prompt fraco',
];

export default function TrainingPage() {
  const [catalog, setCatalog]             = useState(EMPTY_CATALOG);
  const [selectedAgent, setSelectedAgent] = useState('carousel-image-prompt-director');
  const [memory, setMemory]               = useState(null);
  const [budget, setBudget]               = useState(null);
  const [systemCheck, setSystemCheck]     = useState(null);
  const [loading, setLoading]             = useState(false);
  const [feedbackMsg, setFeedbackMsg]     = useState('');
  const [expandedSection, setExpandedSection] = useState('budget');

  // Feedback form state
  const [fbType, setFbType]       = useState('feedback');
  const [fbReason, setFbReason]   = useState('');
  const [fbContent, setFbContent] = useState('');
  const [fbSending, setFbSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [memRes, budRes] = await Promise.allSettled([
        trainingApi.getMemory(selectedAgent),
        trainingApi.getTokenBudget(),
      ]);
      if (memRes.status === 'fulfilled') setMemory(memRes.value);
      if (budRes.status === 'fulfilled') setBudget(budRes.value);
      const [agentsRes, skillsRes] = await Promise.allSettled([
        catalogApi.getSystemAgents(),
        catalogApi.getSystemSkills(),
      ]);
      if (agentsRes.status === 'fulfilled' && skillsRes.status === 'fulfilled') {
        setSystemCheck({
          agents: agentsRes.value.agents || [],
          skills: skillsRes.value.skills || [],
          orphanAgents: skillsRes.value.orphanAgents || agentsRes.value.orphanAgents || [],
          orphanSkills: skillsRes.value.orphanSkills || agentsRes.value.orphanSkills || [],
          duplicateMappings: skillsRes.value.duplicateMappings || agentsRes.value.duplicateMappings || [],
          activeMappings: skillsRes.value.activeMappings || agentsRes.value.activeMappings || [],
          missingRequiredAgents: skillsRes.value.missingRequiredAgents || agentsRes.value.missingRequiredAgents || [],
          missingRequiredSkills: skillsRes.value.missingRequiredSkills || agentsRes.value.missingRequiredSkills || [],
          health: skillsRes.value.health || agentsRes.value.health || {},
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedAgent]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [agents, skillCatalog] = await Promise.all([
          agentsApi.list(),
          skillsApi.catalog(),
        ]);
        if (cancelled) return;
        const nextCatalog = [
          ...(agents || []).map(agent => ({
            id: agent.id,
            label: agent.name || agent.id,
            icon: '🤖',
            kind: 'agent',
          })),
          ...((skillCatalog?.skills || skillCatalog?.items || []).map(skill => ({
            id: skill.id,
            label: skill.nome || skill.id,
            icon: '🧩',
            kind: 'skill',
          }))),
        ].filter((item, index, arr) => arr.findIndex(other => other.id === item.id) === index);
        setCatalog(nextCatalog);
        if (nextCatalog.length && !nextCatalog.some(item => item.id === selectedAgent)) {
          setSelectedAgent(nextCatalog[0].id);
        }
      } catch {
        setCatalog(EMPTY_CATALOG);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedAgent]);

  useEffect(() => { load(); }, [load]);

  const sendFeedback = async () => {
    if (!fbContent.trim() && fbType === 'feedback') return;
    setFbSending(true);
    setFeedbackMsg('');
    try {
      await trainingApi.sendFeedback({
        agentId: selectedAgent,
        type: fbType,
        reason: fbReason || undefined,
        content: fbContent || undefined,
      });
      setFeedbackMsg('✅ Feedback salvo com sucesso!');
      setFbContent('');
      setFbReason('');
      load();
    } catch {
      setFeedbackMsg('❌ Erro ao salvar feedback.');
    } finally {
      setFbSending(false);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <Brain size={22} style={{ color: '#e50914' }} />
          <h1 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
            Agent Training
          </h1>
        </div>
        <p style={{ color: '#888', fontSize: '0.8rem', margin: 0 }}>
          Treine os agentes com exemplos bons, ruins e feedback. Quanto mais dados, melhores as saídas.
        </p>
      </div>

      {/* Agent selector */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ color: '#aaa', fontSize: '0.75rem', display: 'block', marginBottom: '0.4rem' }}>
          Agente
        </label>
        <select
          value={selectedAgent}
          onChange={e => setSelectedAgent(e.target.value)}
          style={{ width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: '#fff', padding: '0.65rem 0.9rem', fontSize: '0.85rem' }}
        >
          {catalog.map(a => (
            <option key={a.id} value={a.id}>{a.icon} {a.label} ({a.kind})</option>
          ))}
        </select>
      </div>

      {/* Memory Summary */}
      <Section
        title="🛠️ System Check"
        expanded={expandedSection === 'system'}
        onToggle={() => setExpandedSection(v => v === 'system' ? '' : 'system')}
      >
        {systemCheck ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SystemLine label="Agentes ativos" value={systemCheck.agents.length} />
            <SystemLine label="Skills carregadas" value={systemCheck.skills.length} />
            <SystemLine label="Agentes órfãos" value={systemCheck.orphanAgents.length} tone={systemCheck.orphanAgents.length ? 'warn' : 'ok'} />
            <SystemLine label="Skills órfãs" value={systemCheck.orphanSkills.length} tone={systemCheck.orphanSkills.length ? 'warn' : 'ok'} />
            <SystemLine label="Mapeamentos duplicados" value={systemCheck.duplicateMappings.length} tone={systemCheck.duplicateMappings.length ? 'warn' : 'ok'} />
            <SystemLine label="Agentes obrigatórios faltando" value={systemCheck.missingRequiredAgents.length} tone={systemCheck.missingRequiredAgents.length ? 'warn' : 'ok'} />
            <SystemLine label="Skills obrigatórias faltando" value={systemCheck.missingRequiredSkills.length} tone={systemCheck.missingRequiredSkills.length ? 'warn' : 'ok'} />
            <SystemLine label="Health vídeo" value={systemCheck.health?.video?.status || 'N/D'} />
            <SystemLine label="Health áudio" value={systemCheck.health?.audio?.status || 'N/D'} />
            <SystemLine label="Health backend" value={systemCheck.health?.backend?.status || 'N/D'} />
          </div>
        ) : <Spinner />}
      </Section>

      <Section
        title="📚 Memória do Agente"
        expanded={expandedSection === 'memory'}
        onToggle={() => setExpandedSection(v => v === 'memory' ? '' : 'memory')}
      >
        {loading ? (
          <Spinner />
        ) : memory ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {Object.entries(memory).map(([type, count]) => (
              <MemoryCard key={type} type={type} count={count} />
            ))}
            {Object.keys(memory).length === 0 && (
              <p style={{ color: '#666', fontSize: '0.8rem', gridColumn: '1/-1' }}>
                Nenhum dado de memória ainda. Envie feedback para começar.
              </p>
            )}
          </div>
        ) : (
          <p style={{ color: '#666', fontSize: '0.8rem' }}>Não foi possível carregar a memória.</p>
        )}
      </Section>

      {/* Token Budget */}
      <Section
        title="⚡ Uso de Tokens Hoje"
        expanded={expandedSection === 'budget'}
        onToggle={() => setExpandedSection(v => v === 'budget' ? '' : 'budget')}
      >
        {budget ? <BudgetDisplay budget={budget} /> : <Spinner />}
      </Section>

      {/* Send Feedback */}
      <Section
        title="💬 Enviar Feedback"
        expanded={expandedSection === 'feedback'}
        onToggle={() => setExpandedSection(v => v === 'feedback' ? '' : 'feedback')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Type */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[
              { v: 'good_example', icon: <ThumbsUp size={14} />, label: 'Bom Exemplo' },
              { v: 'bad_example',  icon: <ThumbsDown size={14} />, label: 'Exemplo Ruim' },
              { v: 'feedback',     icon: <AlertCircle size={14} />, label: 'Feedback Geral' },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => setFbType(opt.v)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '0.35rem', padding: '0.5rem', borderRadius: '0.6rem', fontSize: '0.72rem',
                  border: '1px solid',
                  borderColor: fbType === opt.v ? '#e50914' : 'rgba(255,255,255,0.1)',
                  background: fbType === opt.v ? 'rgba(229,9,20,0.15)' : 'transparent',
                  color: fbType === opt.v ? '#e50914' : '#888', cursor: 'pointer',
                }}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {/* Reason (for bad_example) */}
          {fbType === 'bad_example' && (
            <select
              value={fbReason}
              onChange={e => setFbReason(e.target.value)}
              style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', color: fbReason ? '#fff' : '#666', padding: '0.6rem 0.8rem', fontSize: '0.8rem' }}
            >
              <option value="">Selecione o motivo...</option>
              {BAD_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {/* Content */}
          <textarea
            value={fbContent}
            onChange={e => setFbContent(e.target.value)}
            rows={4}
            placeholder={fbType === 'good_example' ? 'Cole aqui o prompt que funcionou bem...' : fbType === 'bad_example' ? 'Cole aqui o prompt ruim ou descreva o problema...' : 'Descreva seu feedback...'}
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', color: '#fff', padding: '0.7rem', fontSize: '0.8rem', resize: 'vertical' }}
          />

          <button
            onClick={sendFeedback}
            disabled={fbSending}
            style={{
              background: fbSending ? '#333' : '#e50914', color: '#fff', border: 'none',
              borderRadius: '0.7rem', padding: '0.65rem', fontSize: '0.85rem', fontWeight: 600, cursor: fbSending ? 'not-allowed' : 'pointer',
            }}
          >
            {fbSending ? 'Salvando...' : 'Salvar Feedback'}
          </button>

          {feedbackMsg && (
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: feedbackMsg.startsWith('✅') ? '#4ade80' : '#f87171', margin: 0 }}>
              {feedbackMsg}
            </p>
          )}
        </div>
      </Section>

      {/* Refresh */}
      <button
        onClick={load}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem auto 0', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', color: '#aaa', padding: '0.5rem 1rem', fontSize: '0.8rem', cursor: 'pointer' }}
      >
        <RefreshCw size={14} /> Atualizar
      </button>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children, expanded, onToggle }) {
  return (
    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '1rem', marginBottom: '0.75rem', overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
      >
        {title}
        {expanded ? <ChevronUp size={16} color="#666" /> : <ChevronDown size={16} color="#666" />}
      </button>
      {expanded && (
        <div style={{ padding: '0 1rem 1rem' }}>{children}</div>
      )}
    </div>
  );
}

function MemoryCard({ type, count }) {
  const labels = {
    good_example: { label: 'Bons Exemplos', color: '#4ade80', icon: '👍' },
    bad_example:  { label: 'Exemplos Ruins', color: '#f87171', icon: '👎' },
    feedback:     { label: 'Feedbacks', color: '#60a5fa', icon: '💬' },
    style_reference: { label: 'Referências', color: '#fbbf24', icon: '🎨' },
    prompt_pack:  { label: 'Prompt Packs', color: '#a78bfa', icon: '📦' },
    evaluation:   { label: 'Avaliações', color: '#fb923c', icon: '📊' },
  };
  const info = labels[type] || { label: type, color: '#888', icon: '📄' };
  return (
    <div style={{ background: '#1a1a1a', borderRadius: '0.75rem', padding: '0.75rem', border: `1px solid ${info.color}22` }}>
      <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.25rem' }}>{info.icon} {info.label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: info.color }}>{count}</div>
    </div>
  );
}

function SystemLine({ label, value, tone = 'neutral' }) {
  const color = tone === 'warn' ? '#f59e0b' : tone === 'ok' ? '#4ade80' : '#ddd';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.45rem' }}>
      <span style={{ color: '#999', fontSize: '0.78rem' }}>{label}</span>
      <span style={{ color, fontSize: '0.8rem', fontWeight: 600 }}>{String(value)}</span>
    </div>
  );
}

function BudgetDisplay({ budget }) {
  if (!budget?.strong) return <p style={{ color: '#666', fontSize: '0.8rem' }}>Dados indisponíveis.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <BudgetBar label="🔥 Modelo Strong" used={budget.strong.used} limit={budget.strong.limit} pct={budget.strong.pct} color="#e50914" />
      <BudgetBar label="⚡ Modelo Mini"   used={budget.mini.used}   limit={budget.mini.limit}   pct={budget.mini.pct}   color="#3b82f6" />
      {budget.topTask && (
        <p style={{ color: '#666', fontSize: '0.72rem', margin: 0 }}>
          🏆 Maior consumo: <span style={{ color: '#aaa' }}>{budget.topTask.task}</span> — {budget.topTask.tokens} tokens ({budget.topTask.tier})
        </p>
      )}
    </div>
  );
}

function BudgetBar({ label, used, limit, pct, color }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.78rem', color: '#ccc' }}>{label}</span>
        <span style={{ fontSize: '0.72rem', color: '#888' }}>{used.toLocaleString()} / {limit.toLocaleString()} ({pct}%)</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #333', borderTopColor: '#e50914', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}
