#!/bin/bash
# BotSquad v6 — setup.sh
# One-command setup: checks deps, creates .env, starts services.

set -e

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }
step()  { echo -e "\n${BOLD}▸ $1${NC}"; }

echo -e "${BOLD}"
echo "  ╔══════════════════════════════╗"
echo "  ║   BotSquad v6  —  Setup      ║"
echo "  ╚══════════════════════════════╝"
echo -e "${NC}"

# ── Check prerequisites ───────────────────────────────────────────────────
step "Checking prerequisites"

command -v docker     >/dev/null 2>&1 || error "Docker not found. Install from https://docs.docker.com/get-docker/"
command -v docker-compose >/dev/null 2>&1 || \
  (docker compose version >/dev/null 2>&1 || error "Docker Compose not found")

COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || COMPOSE="docker-compose"

info "Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"
info "Compose: $($COMPOSE version --short 2>/dev/null || echo 'ok')"

# ── Port detection ────────────────────────────────────────────────────────
step "Checking ports"

check_port() {
  local port=$1
  if lsof -i ":$port" >/dev/null 2>&1 || nc -z localhost "$port" >/dev/null 2>&1; then
    return 1  # port in use
  fi
  return 0  # port free
}

BACKEND_PORT=4000
FRONTEND_PORT=3000

if ! check_port $BACKEND_PORT; then
  warn "Port $BACKEND_PORT is in use — trying 4001"
  BACKEND_PORT=4001
  if ! check_port $BACKEND_PORT; then
    BACKEND_PORT=4002
    warn "Port 4001 also in use — using $BACKEND_PORT"
  fi
fi

if ! check_port $FRONTEND_PORT; then
  warn "Port $FRONTEND_PORT is in use — trying 3001"
  FRONTEND_PORT=3001
  if ! check_port $FRONTEND_PORT; then
    FRONTEND_PORT=8080
    warn "Port 3001 also in use — using $FRONTEND_PORT"
  fi
fi

info "Backend port: $BACKEND_PORT"
info "Frontend port: $FRONTEND_PORT"

# ── Create .env ───────────────────────────────────────────────────────────
step "Configuring environment"

if [ -f .env ]; then
  warn ".env already exists — keeping it (delete to reconfigure)"
else
  if [ ! -f .env.example ]; then
    error ".env.example not found. Run this script from the project root."
  fi

  # Ask for OpenAI key
  echo ""
  echo -e "${BOLD}Enter your OpenAI API key${NC} (starts with sk-):"
  read -r -p "  OPENAI_API_KEY: " OPENAI_KEY

  if [ -z "$OPENAI_KEY" ] || [[ "$OPENAI_KEY" != sk-* ]]; then
    warn "No valid OpenAI key provided — you can set it manually in .env"
    OPENAI_KEY="sk-REPLACE_WITH_YOUR_KEY"
  fi

  # Generate random secrets
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 48)
  SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 48)
  DB_PASS=$(openssl rand -hex 16 2>/dev/null || echo "botsquad_$(date +%s)")

  cp .env.example .env

  # Inject values
  sed -i.bak "s|sk-\.\.\.|$OPENAI_KEY|g"         .env
  sed -i.bak "s|BACKEND_PORT=4000|BACKEND_PORT=$BACKEND_PORT|g" .env
  sed -i.bak "s|FRONTEND_PORT=3000|FRONTEND_PORT=$FRONTEND_PORT|g" .env
  sed -i.bak "s|VITE_API_URL=http://localhost:4000|VITE_API_URL=http://localhost:$BACKEND_PORT|g" .env
  sed -i.bak "s|BACKEND_PUBLIC_URL=http://localhost:4000|BACKEND_PUBLIC_URL=http://localhost:$BACKEND_PORT|g" .env
  sed -i.bak "s|FRONTEND_PUBLIC_URL=http://localhost:3000|FRONTEND_PUBLIC_URL=http://localhost:$FRONTEND_PORT|g" .env
  sed -i.bak "s|change_me_to_a_long_random_string_min_32_chars|$JWT_SECRET|g" .env
  sed -i.bak "s|another_long_random_string_min_32_chars|$SESSION_SECRET|g"    .env
  sed -i.bak "s|botsquad_secret_change_me|$DB_PASS|g"                         .env
  rm -f .env.bak

  info ".env created"
fi

# ── Build & start ─────────────────────────────────────────────────────────
step "Building and starting services"
echo "  (This takes 2–5 minutes on first run)"
echo ""

$COMPOSE down --remove-orphans 2>/dev/null || true
$COMPOSE build --no-cache
$COMPOSE up -d

# ── Wait for services ─────────────────────────────────────────────────────
step "Waiting for services to be healthy"

BACKEND_URL="http://localhost:$BACKEND_PORT"
MAX_WAIT=90
WAITED=0

echo -n "  Backend"
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
    echo -e " ${GREEN}✓${NC}"
    break
  fi
  echo -n "."
  sleep 3
  WAITED=$((WAITED + 3))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo -e " ${RED}✗${NC}"
  warn "Backend took too long. Check logs with: $COMPOSE logs backend"
fi

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅  BotSquad v6 is running!${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 Web App:  ${BOLD}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  🔌 API:      ${BOLD}http://localhost:$BACKEND_PORT${NC}"
echo -e "  📋 Health:   ${BOLD}http://localhost:$BACKEND_PORT/health${NC}"
echo ""
echo -e "  ${BOLD}Install as mobile app (PWA):${NC}"
echo -e "  • iOS:     Safari → Share → Add to Home Screen"
echo -e "  • Android: Chrome → ⋮ menu → Install app"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "  • View logs:   $COMPOSE logs -f"
echo -e "  • Stop:        $COMPOSE down"
echo -e "  • Restart:     $COMPOSE restart"
echo ""
