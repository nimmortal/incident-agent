FROM node:24-slim

ENV HOME=/home/agent
ENV PATH="/home/agent/.local/bin:${PATH}"
ENV HERMES_SKILLS_SEED_HOME=/opt/hermes-seed-home
ENV CX_VERSION=0.1.10

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gh postgresql-client ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/agent/.local/bin \
  && curl -fsSL https://get.coralogix.dev/cli | sh

# Hermes installer behavior can change, so this is intentionally isolated.
# If it becomes interactive, install Hermes locally and replace this with a pinned release.
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
COPY scripts/patch-hermes-copilot.py /tmp/patch-hermes-copilot.py
RUN /usr/local/lib/hermes-agent/venv/bin/python /tmp/patch-hermes-copilot.py

RUN set -eux; \
  mkdir -p /tmp/cx-skills "${HERMES_SKILLS_SEED_HOME}/.hermes/skills"; \
  for skill in cx-telemetry-querying cx-cases; do \
    mkdir -p "/tmp/cx-skills/${skill}"; \
    cd "/tmp/cx-skills/${skill}"; \
    npx -y skills add coralogix/cx-cli \
      --agent github-copilot \
      --skill "${skill}" \
      --copy \
      -y; \
    test -d ".agents/skills/${skill}"; \
    cp -R ".agents/skills/${skill}" "${HERMES_SKILLS_SEED_HOME}/.hermes/skills/"; \
  done; \
  rm -rf /tmp/cx-skills \
  && mkdir -p "${HERMES_SKILLS_SEED_HOME}/.hermes/skills/github" \
  && cp -R /home/agent/.hermes/skills/github/github-auth "${HERMES_SKILLS_SEED_HOME}/.hermes/skills/github/" \
  && cp -R /home/agent/.hermes/skills/github/github-issues "${HERMES_SKILLS_SEED_HOME}/.hermes/skills/github/" \
  && cp -R /home/agent/.hermes/skills/github/github-pr-workflow "${HERMES_SKILLS_SEED_HOME}/.hermes/skills/github/" \
  && cp -R /home/agent/.hermes/skills/github/github-repo-management "${HERMES_SKILLS_SEED_HOME}/.hermes/skills/github/"

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY config ./config
COPY skills ./skills

RUN mkdir -p /home/agent/.hermes /app/data

CMD ["npm", "run", "poll"]
