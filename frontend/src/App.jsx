import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore }  from './store/auth.js';
import { catalogApi, settingsApi }   from './services/api.js';
import Layout            from './layouts/Layout.jsx';
import LoginPage         from './pages/LoginPage.jsx';
import PrivateAccessPage from './pages/PrivateAccessPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import HomePage          from './pages/HomePage.jsx';
import ChatPage          from './pages/ChatPage.jsx';
import AudioPage         from './pages/AudioPage.jsx';
import MemoryPage        from './pages/MemoryPage.jsx';
import SkillsPage        from './pages/SkillsPage.jsx';
import SettingsPage      from './pages/SettingsPage.jsx';
import IntegrationsPage  from './pages/IntegrationsPage.jsx';
import InvestigatorPage  from './pages/InvestigatorPage.jsx';
import SocialResearchPage from './pages/SocialResearchPage.jsx';
import VideoPage         from './pages/VideoPage.jsx';
import TrainingPage      from './pages/TrainingPage.jsx';

// Guard: requires login
function RequireAuth({ children }) {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

// Guard: requires an API key to be configured
function RequireApiKey({ children }) {
  const [status, setStatus] = useState(null); // null=loading, true=ok, false=missing

  useEffect(() => {
    settingsApi.getStatus()
      .then(r => {
        if (r.configured) return setStatus(true);
        return catalogApi.getSystemProviders()
          .then(system => setStatus((system.providers || []).some(provider => provider.configured)))
          .catch(() => setStatus(false));
      })
      .catch(() => {
        catalogApi.getSystemProviders()
          .then(system => setStatus((system.providers || []).some(provider => provider.configured)))
          .catch(() => setStatus(true));
      }); // network error: let through, backend will reject with clear message
  }, []);

  // Loading spinner — shown only briefly during first status check
  if (status === null) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
      <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      <p className="text-xs">Checking configuration…</p>
    </div>
  );

  // No key configured — redirect to settings with a clear message
  if (!status) return <Navigate to="/settings?setup=1" replace />;
  return children;
}

export default function App() {
  const init = useAuthStore(s => s.init);
  const [privateChecked, setPrivateChecked] = useState(false);
  const [privateRequired, setPrivateRequired] = useState(false);

  React.useEffect(() => {
    init();
    fetch('/api/system/health', { credentials: 'include' })
      .then(async response => {
        if (response.status === 401) {
          const data = await response.json().catch(() => ({}));
          if (data?.code === 'private_access_required') {
            setPrivateRequired(true);
          }
        }
      })
      .catch(() => {})
      .finally(() => setPrivateChecked(true));
  }, [init]);

  if (!privateChecked) return null;
  if (privateRequired) {
    return <PrivateAccessPage onSuccess={() => setPrivateRequired(false)} />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<HomePage />} />
        {/* These routes require an API key */}
        <Route path="chat"        element={<RequireApiKey><ChatPage /></RequireApiKey>} />
        <Route path="chat/:id"    element={<RequireApiKey><ChatPage /></RequireApiKey>} />
        <Route path="audio"       element={<RequireApiKey><AudioPage /></RequireApiKey>} />
        <Route path="investigator" element={<RequireApiKey><InvestigatorPage /></RequireApiKey>} />
        <Route path="research"    element={<RequireApiKey><Navigate to="/investigator?preset=research" replace /></RequireApiKey>} />
        <Route path="social"      element={<RequireApiKey><SocialResearchPage /></RequireApiKey>} />
        <Route path="skills"      element={<RequireApiKey><SkillsPage /></RequireApiKey>} />
        <Route path="memory"      element={<RequireApiKey><MemoryPage /></RequireApiKey>} />
        <Route path="video"       element={<RequireApiKey><VideoPage /></RequireApiKey>} />
        <Route path="training"    element={<RequireApiKey><TrainingPage /></RequireApiKey>} />
        {/* Settings is always accessible */}
        <Route path="settings"    element={<SettingsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
      </Route>
    </Routes>
  );
}
