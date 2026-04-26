import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api.js';
import './login.css';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const token = params.get('token') || '';

  const handleSubmit = async () => {
    if (!token) return toast.error('Link de redefinição inválido ou expirado.');
    if (password.length < 8) return toast.error('Senha deve ter no mínimo 8 caracteres');
    if (password !== confirmPassword) return toast.error('As senhas precisam ser iguais');

    setLoading(true);
    try {
      const response = await authApi.resetPassword({ token, password, confirmPassword });
      setDone(true);
      toast.success(response?.message || 'Senha redefinida com sucesso.');
    } catch (err) {
      toast.error(err.message || 'Link de redefinição inválido ou expirado.');
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
        <section className="auth-card" aria-label="Redefinir senha">
          <div className="auth-card-top">
            <div className="auth-brand-mark"><span>B</span></div>
            <div>
              <h1>Nova senha</h1>
              <p>Crie uma senha segura para voltar ao BotSquad</p>
            </div>
          </div>

          {done ? (
            <>
              <div className="auth-status-area">
                <div className="auth-status auth-status-ok">
                  <span>Senha redefinida com sucesso.</span>
                </div>
              </div>
              <Link to="/login" className="auth-primary-button auth-link-button">Voltar para login</Link>
            </>
          ) : (
            <>
              <div className="auth-form-stack">
                <label className="auth-field auth-field-password">
                  <Lock size={18} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Nova senha (mín. 8 chars)"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPass(v => !v)}
                    aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </label>

                <label className="auth-field">
                  <Lock size={18} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Confirmar nova senha"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  />
                </label>
              </div>

              <button type="button" onClick={handleSubmit} disabled={loading} className="auth-primary-button">
                {loading ? (
                  <span className="auth-loading"><span />Redefinindo...</span>
                ) : 'Redefinir senha'}
              </button>
              <p className="auth-microcopy">
                <Link to="/login" className="auth-inline-link">Voltar para login</Link>
              </p>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
