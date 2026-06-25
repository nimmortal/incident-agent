import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const githubAppRequiredEnvVars = ["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID"] as const;
const githubAppPrivateKeyEnvVars = ["GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_PRIVATE_KEY_BASE64", "GITHUB_APP_PRIVATE_KEY_PATH"] as const;
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
  return githubAppRequiredEnvVars.every((name) => env[name]?.trim()) && Boolean(privateKeySource(env));
}

export function missingGitHubAppCredentials(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = githubAppRequiredEnvVars.filter((name) => !env[name]?.trim());
  if (!privateKeySource(env)) {
    missing.push(githubAppPrivateKeyEnvVars.join(" or "));
  }
  return missing;
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
    privateKey: readPrivateKey(env),
  };
}

function normalizePrivateKey(value: string): string {
  return value.trim().replace(/\r\n/g, "\n").replace(/\\n/g, "\n");
}

function privateKeySource(env: NodeJS.ProcessEnv): (typeof githubAppPrivateKeyEnvVars)[number] | undefined {
  return githubAppPrivateKeyEnvVars.find((name) => env[name]?.trim());
}

function readPrivateKey(env: NodeJS.ProcessEnv): string {
  if (env.GITHUB_APP_PRIVATE_KEY?.trim()) {
    return normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  }
  if (env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim()) {
    return normalizePrivateKey(Buffer.from(env.GITHUB_APP_PRIVATE_KEY_BASE64.trim(), "base64").toString("utf8"));
  }
  if (env.GITHUB_APP_PRIVATE_KEY_PATH?.trim()) {
    return normalizePrivateKey(readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH.trim(), "utf8"));
  }

  throw new Error(`Missing GitHub App private key. Set one of: ${githubAppPrivateKeyEnvVars.join(", ")}`);
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
      [
        "Failed to sign GitHub App JWT.",
        "Use the private key PEM downloaded from the GitHub App settings, not the webhook secret or client secret.",
        "Set it with GITHUB_APP_PRIVATE_KEY_PATH, GITHUB_APP_PRIVATE_KEY_BASE64, or GITHUB_APP_PRIVATE_KEY with PEM newlines escaped as \\n.",
        detail,
      ].join(" "),
    );
  }
  return `${data}.${signature}`;
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
