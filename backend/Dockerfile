FROM node:20-alpine

# Create non-root user (security fix)
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup AS base

# System deps:
# - ffmpeg: audio conversion (WAV ↔ PCM for CamillaDSP pipeline)
# - chromium: local HTML/CSS → PNG rendering for visual agent
# - python3/make/g++: native Node addons (sharp, etc.)
# - wget: healthcheck
# - libsndfile: WAV parsing used by ir-processor
RUN apk add --no-cache \
    ffmpeg \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    python3 \
    make \
    g++ \
    wget \
    libsndfile \
    libsndfile-dev

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src ./src
COPY camilla-configs ./camilla-configs

# Storage dirs — also created at runtime by index.js, but pre-create for safety
RUN mkdir -p \
    storage/uploads \
    storage/outputs \
    storage/irs \
    storage/temp \
    storage/previews \
    storage/logs \
    storage/memory

# CamillaDSP binary is optional — audio falls back to ir-processor if absent
# To add it: docker build --build-arg WITH_CAMILLA=1
ARG WITH_CAMILLA=0

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=40s \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

USER nodeuser
CMD ["node", "src/index.js"]
