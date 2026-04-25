# BotSquad v6 — AI Platform (PWA)

**37 AI skills** para áudio, conteúdo, marketing e crescimento.  
App web PWA instalável no Android e iOS — sem Telegram, sem bots.

---

## 🚀 Início rápido

```bash
# 1. Clone / extraia o projeto
cd botsquad-v6

# 2. Copie e configure o .env
cp .env.example .env
# Edite .env e coloque sua OPENAI_API_KEY

# 3. Suba tudo com um comando
./setup.sh
```

Ou manualmente:

```bash
cp .env.example .env
# Edite .env com sua chave OpenAI
docker compose up -d --build
```

**URLs após subir:**
- 🌐 App: `http://localhost:3000`
- 🔌 API: `http://localhost:4000`

---

## 📱 Instalar no celular (PWA)

| Plataforma | Passos |
|---|---|
| **iOS (iPhone/iPad)** | Abra no Safari → toque em Compartilhar → "Adicionar à Tela Inicial" |
| **Android** | Abra no Chrome → menu ⋮ → "Instalar app" |

> O app funciona offline (chat em cache, histórico local).

---

## ⚙️ Variáveis de ambiente (.env)

| Variável | Obrigatório | Descrição |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | Chave da OpenAI (sk-...) |
| `OPENAI_MODEL` | — | Padrão: `gpt-4o` |
| `JWT_SECRET` | ✅ (em produção) | String longa aleatória para auth |
| `POSTGRES_PASSWORD` | ✅ (em produção) | Senha do banco |
| `VITE_API_URL` | ✅ | URL do backend (troque para IP do servidor em produção) |
| `GOOGLE_CLIENT_ID` | — | Para integração com Google Drive |

---

## 🧠 Skills disponíveis (37)

### Áudio / Guitarra
- **AudioEngineer** — análise de IR, presets, tone shaping
- Presets prontos: `worship-clean`, `bethel-ambient`, `hillsong`, `lead`
- Pipeline: CamillaDSP → fallback automático para ir-processor

### Conteúdo
- **CopyExpert** — copy persuasiva, VSL, email marketing
- **HookHunter** — hooks virais para TikTok, Reels, YouTube
- **InfoproductBuilder** — criação de infoprodutos completos
- **FunnelArchitect** — funis de vendas
- E mais 10 skills de conteúdo…

### Visual
- **VisualExpert** — briefing de carrossel, thumbnail, criativo
- Geração real de imagens via DALL-E 3

### Pesquisa / Mercado
- **MarketIntel** — análise de mercado e concorrência
- **NicheResearcher** — pesquisa de nicho em tempo real
- **ProfileAnalyst** — análise de perfis sociais

### Analytics / Sistema
- **PerformanceAnalyst**, **DataLogger**, **ExperimentManager**
- **LearningOptimizer**, **FeedbackCollector**
- E mais…

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                   PWA (React + Vite)                 │
│     Chat · Audio · Skills · Memory                   │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼──────────────────────────────┐
│               Express Backend (Node 20)              │
│                                                      │
│  Orchestrator → IntentEngine → Planner               │
│       ↓                                              │
│  SkillManager (37 skills)                            │
│       ↓                                              │
│  OpenAI (gpt-4o, dall-e-3, whisper, embeddings)      │
│  CamillaDSP / ir-processor (audio)                   │
│  MemoryMCP (file-based persistent memory)            │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               PostgreSQL 15                          │
│  users · conversations · messages                    │
│  memory · audio_jobs                                 │
└─────────────────────────────────────────────────────┘
```

---

## 🔊 Processamento de áudio

1. Upload WAV/MP3/FLAC via app
2. Tenta **CamillaDSP** com preset selecionado
3. Se CamillaDSP não disponível → **ir-processor** automático
4. Download do WAV processado com token de autenticação

**Sample rates suportados:** 44.1kHz, 48kHz, 96kHz

---

## 🧪 Testes rápidos

```bash
# Health check
curl http://localhost:4000/health

# Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234"}'

# Chat (com token)
curl -X POST http://localhost:4000/chat/conversations \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}'

# Skills disponíveis
curl http://localhost:4000/skills \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🛠️ Comandos úteis

```bash
# Ver logs em tempo real
docker compose logs -f

# Ver só o backend
docker compose logs -f backend

# Reiniciar um serviço
docker compose restart backend

# Parar tudo
docker compose down

# Parar e remover volumes (reset completo)
docker compose down -v

# Rebuild após mudanças
docker compose up -d --build
```

---

## 📂 Estrutura do projeto

```
botsquad-v6/
├── docker-compose.yml
├── .env.example
├── setup.sh
├── backend/
│   ├── src/
│   │   ├── agents/         # audioAgent, contentAgent, visualAgent, researchAgent
│   │   ├── agents/orchestrator.js  # cérebro principal
│   │   ├── core/           # intent-engine, planner, decision-engine
│   │   ├── skills/         # 37 skills executores
│   │   ├── integrations/   # openai-advanced, camilla, audio-pipeline
│   │   ├── workers/audio/  # ir-processor, preset-auto-generator
│   │   ├── mcps/           # memory-mcp, web-search, web-scraper
│   │   ├── modules/        # workflow-orchestrator, context-manager
│   │   ├── routes/         # chat, audio, memory, skills, drive, auth
│   │   └── db/             # migrations, pool
│   └── camilla-configs/
└── frontend/
    └── src/
        ├── pages/          # ChatPage, AudioPage, SkillsPage, MemoryPage
        ├── layouts/
        ├── services/api.js
        └── store/auth.js
```

---

## 🔒 Segurança em produção

1. Mude `JWT_SECRET` e `SESSION_SECRET` para strings longas aleatórias
2. Mude `POSTGRES_PASSWORD` para senha forte
3. Configure `VITE_API_URL` com o IP/domínio real do servidor
4. Use HTTPS (nginx + certbot, Cloudflare Tunnel, ou Caddy)

---

## 📝 Changelog v6

- ✅ PWA instalável (Android + iOS) — sem Telegram
- ✅ 37 skills com OpenAI gpt-4o
- ✅ Geração de imagens DALL-E 3
- ✅ Download de áudio com autenticação JWT
- ✅ CamillaDSP + fallback automático ir-processor
- ✅ Presets: worship-clean, bethel-ambient, hillsong, lead
- ✅ Memória persistente por usuário
- ✅ Delete/rename de conversas
- ✅ Auto-title de conversas
- ✅ Splash screens iOS + Android
