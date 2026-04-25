import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import './styles/index.css';

// iOS standalone PWA: prevent bounce on overscroll
document.addEventListener('touchmove', e => {
  if (e.scale !== 1) e.preventDefault();
}, { passive: false });

// Remove boot loader once React is ready
const bootLoader = document.getElementById('boot-loader');
if (bootLoader) bootLoader.remove();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#111116',
            color: '#f3f4f6',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '18px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#e50914', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
