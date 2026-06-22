FROM node:24-slim

ENV HOME=/home/agent
ENV PATH="/home/agent/.local/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gh \
  && rm -rf /var/lib/apt/lists/*

# Hermes installer behavior can change, so this is intentionally isolated.
# If it becomes interactive, install Hermes locally and replace this with a pinned release.
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

COPY src ./src
COPY config ./config
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --omit=dev

RUN mkdir -p /home/agent/.hermes /app/data

CMD ["npm", "run", "poll"]
