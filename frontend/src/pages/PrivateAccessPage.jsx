import { useState } from 'react';
import './login.css';

export default function PrivateAccessPage({ onSuccess }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    const trimmed = token.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/private-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setError('Token inválido. Tente novamente.');
        return;
      }
      setToken('');
      if (onSuccess) onSuccess();
      else window.location.reload();
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-premium-shell">
      <div className="auth-bg-glow auth-bg-glow-one" />
      <div className="auth-bg-glow auth-bg-glow-two" />
      <section className="auth-stage auth-stage-single">
        <section className="auth-card" aria-label="Acesso privado">
          <div className="auth-card-top">
            <div className="auth-brand-mark"><span>B</span></div>
            <div>
              <h1>Acesso privado</h1>
              <p>Este ambiente exige um token de acesso antes do login.</p>
            </div>
          </div>

          <div className="auth-form-stack">
            <label className="auth-field">
              <input
                type="password"
                placeholder="Cole o token de acesso"
                value={token}
                onChange={event => setToken(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleSubmit()}
                autoFocus
                autoComplete="off"
              />
            </label>
          </div>

          {error ? (
            <div className="auth-status-area">
              <div className="auth-status auth-status-error">
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !token.trim()}
            className="auth-primary-button"
          >
            {loading ? (
              <span className="auth-loading"><span />Verificando...</span>
            ) : 'Liberar acesso'}
          </button>
        </section>
      </section>
    </main>
  );
}
