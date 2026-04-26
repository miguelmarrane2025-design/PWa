import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api.js';
import './login.css';

const SUCCESS_MESSAGE = 'Se este e-mail estiver cadastrado, enviaremos instruções para redefinir sua senha.';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email) return toast.error('Informe seu e-mail');
    setLoading(true);
    try {
      const response = await authApi.forgotPassword({ email });
      setSent(true);
      toast.success(response?.message || SUCCESS_MESSAGE);
    } catch (err) {
      toast.error(err.message || 'Não foi possível enviar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-premium-shell">
      <div className="auth-bg-glow auth-bg-glow-one" />
      <div className="auth-bg-glow auth-bg-glow-two" />
      <div className="auth-particles" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => <span key={index} />)}
      </div>

      <section className="auth-stage auth-stage-single">
        <section className="auth-card" aria-label="Recuperação de senha">
          <div className="auth-card-top">
            <div className="auth-brand-mark"><span>B</span></div>
            <div>
              <h1>Recuperar senha</h1>
              <p>Informe o e-mail da sua conta BotSquad</p>
            </div>
          </div>

          {sent && (
            <div className="auth-status-area">
              <div className="auth-status auth-status-ok">
                <span>{SUCCESS_MESSAGE}</span>
              </div>
            </div>
          )}

          <div className="auth-form-stack">
            <label className="auth-field">
              <Mail size={18} />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </label>
          </div>

          <button type="button" onClick={handleSubmit} disabled={loading} className="auth-primary-button">
            {loading ? (
              <span className="auth-loading"><span />Enviando...</span>
            ) : 'Enviar link de recuperação'}
          </button>

          <p className="auth-microcopy">
            <Link to="/login" className="auth-inline-link">Voltar para login</Link>
          </p>
        </section>
      </section>
    </main>
  );
}
