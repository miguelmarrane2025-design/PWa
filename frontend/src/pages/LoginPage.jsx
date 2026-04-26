import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore }    from '../store/auth.js';
import { BASE, healthApi } from '../services/api.js';
import { Eye, EyeOff, Lock, Mail, User, Wifi, WifiOff } from 'lucide-react';
import toast               from 'react-hot-toast';
import './login.css';

const OAUTH_FLAGS = {
  google: import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === 'true',
  apple: import.meta.env.VITE_APPLE_OAUTH_ENABLED === 'true',
  facebook: import.meta.env.VITE_FACEBOOK_OAUTH_ENABLED === 'true',
};

function getAuthUrl(provider) {
  return new URL(`${BASE}/auth/${provider}`, window.location.origin).toString();
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-.8 2.4-1.8 3.1l2.9 2.3c1.7-1.6 2.7-3.9 2.7-6.7 0-.6-.1-1.1-.2-1.6H12z" />
      <path fill="#34A853" d="M6.4 14.3l-.7.6-2.3 1.8C5 19.9 8.2 22 12 22c2.4 0 4.8-.8 6.5-2.4l-2.9-2.3c-.8.5-1.9.9-3.6.9-2.7 0-5-1.8-5.8-4.3l.2.4z" />
      <path fill="#FBBC05" d="M3.4 7.3C2.8 8.5 2.5 10.1 2.5 12s.3 3.5.9 4.7l3-2.3c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3-2.3z" />
      <path fill="#4285F4" d="M12 5.8c1.3 0 2.5.5 3.5 1.4l2.6-2.6C16.5 3 14.4 2 12 2 8.2 2 5 4.1 3.4 7.3l3 2.3C7.2 7.1 9.5 5.8 12 5.8z" />
    </svg>
  );
}

function SocialLoginButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="auth-social-button"
    >
      <span className="auth-social-icon">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export default function LoginPage() {
  const [mode,      setMode]     = useState('login');
  const [email,     setEmail]    = useState('');
  const [password,  setPassword] = useState('');
  const [name,      setName]     = useState('');
  const [loading,    setLoading]   = useState(false);
  const [showPass,   setShowPass]  = useState(false);
  const [backendOk,  setBackendOk] = useState(null); // null=checking, true=ok, false=unreachable
  const { login, register }        = useAuthStore();
  const navigate                   = useNavigate();

  // Check backend connectivity on mount
  useEffect(() => {
    healthApi.check()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  const handleSubmit = async () => {
    if (!email || !password) return toast.error('Preencha todos os campos');
    if (mode === 'register' && password.length < 8)
      return toast.error('Senha deve ter no mínimo 8 caracteres');
    setLoading(true);
    try {
      mode === 'login'
        ? await login(email, password)
        : await register(email, password, name);
      navigate(mode === 'register' ? '/settings' : '/');
    } catch (err) {
      toast.error(err.message || 'Erro de conexão. Verifique o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = (provider, enabled, message) => {
    if (!enabled) return toast.error(message);
    window.location.href = getAuthUrl(provider);
  };

  const handleGoogleLogin = () => {
    handleOAuthLogin('google', OAUTH_FLAGS.google, 'Login com Google ainda não configurado.');
  };

  const handleAppleLogin = () => {
    handleOAuthLogin('apple', OAUTH_FLAGS.apple, 'Login com Apple ainda não configurado.');
  };

  const handleFacebookLogin = () => {
    handleOAuthLogin('facebook', OAUTH_FLAGS.facebook, 'Login com Facebook ainda não configurado.');
  };

  return (
    <main className="auth-premium-shell">
      <div className="auth-bg-glow auth-bg-glow-one" />
      <div className="auth-bg-glow auth-bg-glow-two" />
      <div className="auth-particles" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>

      <section className="auth-stage">
        <aside className="auth-mascot-panel" aria-hidden="true">
          <div className="auth-mascot-aura" />
          <div className="auth-mascot">
            <img
              src="/assets/bot.png"
              alt=""
              onError={event => {
                event.currentTarget.style.display = 'none';
              }}
            />
            <div className="auth-bot-fallback">
              <div className="auth-bot-head">
                <span />
                <span />
              </div>
              <div className="auth-bot-body">
                <span />
              </div>
            </div>
          </div>
        </aside>

        <section className="auth-card" aria-label="Acesso ao BotSquad">
          <div className="auth-card-top">
            <div className="auth-brand-mark">
              <span>B</span>
            </div>
            <div>
              <h1>BotSquad</h1>
              <p>37+ skills de IA para criadores</p>
            </div>
          </div>

          <div className="auth-status-area">
            {backendOk === false && (
              <div className="auth-status auth-status-error">
                <WifiOff size={13} />
                <span>Backend inacessível em <code>{BASE}</code>.</span>
              </div>
            )}
            {backendOk === true && (
              <div className="auth-status auth-status-ok">
                <Wifi size={12} />
                <span>Backend conectado</span>
              </div>
            )}
          </div>

          <div className="auth-tabs">
            <span className={`auth-tab-indicator ${mode === 'register' ? 'is-register' : ''}`} />
            {['login','register'].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={mode === m ? 'is-active' : ''}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          <div className="auth-form-stack" key={mode}>
            {mode === 'register' && (
              <label className="auth-field">
                <User size={18} />
                <input
                  placeholder="Seu nome"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}

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

            <label className="auth-field auth-field-password">
              <Lock size={18} />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Senha (mín. 8 chars)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
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
          </div>

          {mode === 'login' && (
            <div className="auth-secondary-action">
              <Link to="/forgot-password">Esqueci minha senha</Link>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="auth-primary-button"
          >
            {loading ? (
              <span className="auth-loading">
                <span />
                Carregando...
              </span>
            ) : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>

          <div className="auth-divider">
            <span />
            <strong>ou</strong>
            <span />
          </div>

          <SocialLoginButton
            icon={<GoogleIcon />}
            label="Entrar com Google"
            onClick={handleGoogleLogin}
          />

          <p className="auth-microcopy">Configure suas APIs no painel após entrar.</p>
        </section>
      </section>
    </main>
  );
}
