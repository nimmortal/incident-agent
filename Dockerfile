FROM node:24.9.0-slim@sha256:3e69116c924bfcba6c6979aff60d966c37aef56d488ce091c69d442ebec9f103

ENV HOME=/home/agent
ENV PATH="/home/agent/.local/bin:${PATH}"
ENV HERMES_SKILLS_SEED_HOME=/opt/hermes-seed-home
ENV CX_VERSION=0.1.10
ARG TARGETARCH
ARG HERMES_VERSION=v2026.7.7.2
ARG HERMES_INSTALLER_SHA256=a93c65b01ea392e179cf872e182bd01a2b65c0c15f17833e9f9569033ef10e07
ARG SKILLS_CLI_VERSION=1.5.20
ARG CORALOGIX_SKILLS_REF=44030b6cad9bd0dda767514871fc5867deb3f939

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gh postgresql-client ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) cx_arch=x86_64; cx_sha=635596af91a3a3bb7c41c299c603c2c83ce18f81c735ad602f2e8e040b61e326 ;; \
    arm64) cx_arch=aarch64; cx_sha=361a0f1bd1981dc44fe27a916c615b6846795c210e480e4f3a9bfd386afaf378 ;; \
    *) echo "Unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  archive="cx-${CX_VERSION}-${cx_arch}-unknown-linux-musl.tar.gz"; \
  curl -fsSL "https://github.com/coralogix/cx-cli/releases/download/v${CX_VERSION}/${archive}" -o "/tmp/${archive}"; \
  echo "${cx_sha}  /tmp/${archive}" | sha256sum -c -; \
  tar xzf "/tmp/${archive}" -C /usr/local/bin cx; \
  chmod 0755 /usr/local/bin/cx; \
  rm -f "/tmp/${archive}"

# Pin both the installer bytes and the repository checkout. The upstream installer
# still manages Hermes' Python environment, but cannot silently move this build to main.
RUN set -eux; \
  curl -fsSL "https://raw.githubusercontent.com/NousResearch/hermes-agent/${HERMES_VERSION}/scripts/install.sh" -o /tmp/hermes-install.sh; \
  echo "${HERMES_INSTALLER_SHA256}  /tmp/hermes-install.sh" | sha256sum -c -; \
  bash /tmp/hermes-install.sh --branch "${HERMES_VERSION}" --skip-setup --skip-browser --no-skills --non-interactive; \
  rm -f /tmp/hermes-install.sh
COPY scripts/patch-hermes-copilot.py /tmp/patch-hermes-copilot.py
RUN /usr/local/lib/hermes-agent/venv/bin/python /tmp/patch-hermes-copilot.py

RUN set -eux; \
  mkdir -p /tmp/cx-skills "${HERMES_SKILLS_SEED_HOME}/.hermes/skills"; \
  for skill in cx-telemetry-querying cx-cases; do \
    mkdir -p "/tmp/cx-skills/${skill}"; \
    cd "/tmp/cx-skills/${skill}"; \
    npx -y "skills@${SKILLS_CLI_VERSION}" add "coralogix/cx-cli@${CORALOGIX_SKILLS_REF}" \
      --agent github-copilot \
      --skill "${skill}" \
      --copy \
      -y; \
    test -d ".agents/skills/${skill}"; \
    cp -R ".agents/skills/${skill}" "${HERMES_SKILLS_SEED_HOME}/.hermes/skills/"; \
  done; \
  rm -rf /tmp/cx-skills

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY config ./config
COPY skills ./skills
COPY scripts/runtime-wrappers ./scripts/runtime-wrappers

RUN groupadd --gid 10001 agent \
  && useradd --uid 10001 --gid 10001 --home-dir /home/agent --shell /usr/sbin/nologin agent \
  && mkdir -p /home/agent/.hermes /app/data \
  && chown -R 10001:10001 /home/agent /app /opt/hermes-seed-home

USER 10001:10001

CMD ["npm", "run", "poll"]
