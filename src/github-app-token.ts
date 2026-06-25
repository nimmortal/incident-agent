import { createSign } from "node:crypto";

const githubAppEnvVars = ["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY"] as const;
const githubAppCopilotSource = "github-app";

interface GitHubAppCredentials {
  appId: string;
  installationId: string;
  privateKey: string;
}

interface InstallationTokenResponse {
  token?: string;
  expires_at?: string;
  message?: string;
}

export function hasGitHubAppCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return githubAppEnvVars.every((name) => env[name]?.trim());
}

export function missingGitHubAppCredentials(env: NodeJS.ProcessEnv = process.env): string[] {
  return githubAppEnvVars.filter((name) => !env[name]?.trim());
}

export function usesGitHubAppTokenForCopilot(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COPILOT_GITHUB_TOKEN_SOURCE?.trim() === githubAppCopilotSource;
}

export async function applyGitHubAppToken(env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  const credentials = readGitHubAppCredentials(env);
  if (!credentials) {
    return env;
  }

  const installation = await createInstallationAccessToken(credentials);
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    GITHUB_TOKEN: installation.token,
  };
  if (usesGitHubAppTokenForCopilot(env)) {
    nextEnv.COPILOT_GITHUB_TOKEN = installation.token;
  }
  delete nextEnv.GH_TOKEN;

  const expires = installation.expiresAt ? `, expires ${installation.expiresAt}` : "";
  console.error(`[incident-agent] GitHub CLI token source: GitHub App installation ${credentials.installationId} (ghs_*${expires})`);
  if (usesGitHubAppTokenForCopilot(env)) {
    console.error(`[incident-agent] Copilot token source: GitHub App installation ${credentials.installationId} (ghs_*)`);
  }
  return nextEnv;
}

function readGitHubAppCredentials(env: NodeJS.ProcessEnv): GitHubAppCredentials | undefined {
  if (!hasGitHubAppCredentials(env)) {
    return undefined;
  }

  return {
    appId: env.GITHUB_APP_ID!.trim(),
    installationId: env.GITHUB_APP_INSTALLATION_ID!.trim(),
    privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY!.trim()),
  };
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

async function createInstallationAccessToken(credentials: GitHubAppCredentials): Promise<{ token: string; expiresAt?: string }> {
  const jwt = createAppJwt(credentials.appId, credentials.privateKey);
  const response = await fetch(`https://api.github.com/app/installations/${credentials.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "incident-agent",
    },
  });
  const body = (await response.json().catch(() => ({}))) as InstallationTokenResponse;

  if (!response.ok || !body.token) {
    const message = body.message ? `: ${body.message}` : "";
    throw new Error(`Failed to create GitHub App installation token (${response.status} ${response.statusText})${message}`);
  }

  return {
    token: body.token,
    expiresAt: body.expires_at,
  };
}

function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({
    alg: "RS256",
    typ: "JWT",
  });
  const payload = base64UrlJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  });
  const data = `${header}.${payload}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64url");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to sign GitHub App JWT. Check GITHUB_APP_PRIVATE_KEY and store PEM newlines as \\n in .env.local. ${detail}`,
    );
  }
  return `${data}.${signature}`;
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
