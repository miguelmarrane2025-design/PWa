import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  HardDrive,
  Link,
  Loader,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import { catalogApi, driveApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';

function IntegrationStatus({ item }) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#111116] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{item.name}</p>
          <p className="mt-1 text-xs text-zinc-500">Estado real coletado do backend</p>
        </div>
        <span className={clsx(
          'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
          item.connected
            ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300'
            : item.status === 'available'
              ? 'border-amber-500/30 bg-amber-500/[0.12] text-amber-200'
              : 'border-white/10 bg-white/[0.06] text-zinc-300',
        )}>
          {item.status}
        </span>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState({ items: [] });
  const [driveStatus, setDriveStatus] = useState(null);
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const load = async () => {
    try {
      const [integrationData, driveData] = await Promise.all([
        catalogApi.getIntegrations(),
        driveApi.status().catch(() => ({ configured: false, connected: false })),
      ]);
      setIntegrations(integrationData);
      setDriveStatus(driveData);
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel carregar integrations');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connectDrive = async () => {
    try {
      const { url } = await driveApi.getAuthUrl();
      window.open(url, '_blank', 'width=600,height=700');
      setTimeout(load, 3000);
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel iniciar o OAuth');
    }
  };

  const disconnectDrive = async () => {
    try {
      await driveApi.disconnect();
      setFiles([]);
      toast.success('Google Drive desconectado');
      await load();
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel desconectar o Drive');
    }
  };

  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const response = await driveApi.listFiles();
      setFiles(Array.isArray(response) ? response : []);
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel listar arquivos');
    } finally {
      setLoadingFiles(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[#0f0f14]">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(229,9,20,0.22),_transparent_32%),linear-gradient(135deg,_rgba(255,255,255,0.04),_transparent)] px-6 py-7 sm:px-8">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400/90">
            <Cloud size={14} />
            Integrations
          </p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Conectores reais preservados no patch v26.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
            Esta pagina continua ligada ao Google Drive existente e agora exibe o estado real dos providers de integracao ja visiveis na home.
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5 rounded-[30px] border border-white/10 bg-[#111116] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Google Drive</p>
              <h3 className="mt-2 text-2xl font-black text-white">Fluxo existente</h3>
            </div>
            <div className={clsx(
              'rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em]',
              driveStatus?.connected
                ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300'
                : 'border-white/10 bg-white/[0.06] text-zinc-300',
            )}>
              {driveStatus?.connected ? 'connected' : driveStatus?.configured ? 'available' : 'disabled'}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/[0.12] text-brand-400">
                <HardDrive size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Google Drive</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  OAuth, listagem de arquivos e desconexao continuam ativos no backend atual.
                </p>
              </div>
            </div>

            {!driveStatus?.configured ? (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100/[0.85]">
                Configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no ambiente para liberar o OAuth.
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-3">
                {driveStatus.connected ? (
                  <>
                    <button onClick={loadFiles} disabled={loadingFiles} className="btn-primary rounded-full px-5 py-3 text-sm">
                      {loadingFiles ? <Loader size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      {loadingFiles ? 'Carregando...' : 'Listar arquivos'}
                    </button>
                    <button onClick={disconnectDrive} className="btn-ghost rounded-full px-5 py-3 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200">
                      <Unlink size={16} />
                      Desconectar
                    </button>
                  </>
                ) : (
                  <button onClick={connectDrive} className="btn-primary rounded-full px-5 py-3 text-sm">
                    <Link size={16} />
                    Conectar Google Drive
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
            )}

            {files.length > 0 && (
              <div className="mt-5 space-y-2">
                {files.map(file => (
                  <div key={file.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <p className="truncate text-sm font-medium text-white">{file.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{file.mimeType}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 rounded-[30px] border border-white/10 bg-[#111116] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Provider integrations</p>
              <h3 className="mt-2 text-2xl font-black text-white">Chaves conectadas</h3>
            </div>
            <button onClick={load} className="btn-ghost rounded-full px-4 py-2.5 text-sm">
              <RefreshCw size={15} />
              Atualizar
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(integrations.items || []).map(item => (
              <IntegrationStatus key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
