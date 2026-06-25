import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const githubAppRequiredEnvVars = ["GITHUB_APP_ID"] as const;
const githubAppPrivateKeyEnvVars = ["GITHUB_APP_PRIVATE_KEY_PATH", "GITHUB_APP_PRIVATE_KEY_BASE64", "GITHUB_APP_PRIVATE_KEY"] as const;
const githubAppSelectorEnvVars = ["GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_INSTALLATION_ACCOUNT", "GITHUB_APP_REPOSITORY"] as const;

interface GitHubAppCredentials {
  appId: string;
  installationId?: string;
  account?: string;
  repository?: string;
  privateKey: string;
}

interface GitHubInstallation {
  id?: number;
  account?: {
    login?: string;
  };
}

interface RepositoryInstallationResponse {
  id?: number;
  message?: string;
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

export function gitHubAppTokenSourceDescription(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!hasGitHubAppCredentials(env)) {
    return undefined;
  }

  const selectors = selectedInstallationTargets(env);
  if (selectors.length === 0) {
    return "GitHub App auto-discovered installation";
  }

  const [selector] = selectors;
  switch (selector.name) {
    case "GITHUB_APP_INSTALLATION_ID":
      return `GitHub App installation ${selector.value}`;
    case "GITHUB_APP_INSTALLATION_ACCOUNT":
      return `GitHub App account ${selector.value}`;
    case "GITHUB_APP_REPOSITORY":
      return `GitHub App repository ${selector.value}`;
  }
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
  delete nextEnv.GH_TOKEN;

  const expires = installation.expiresAt ? `, expires ${installation.expiresAt}` : "";
  console.error(`[incident-agent] GitHub CLI token source: GitHub App installation ${installation.installationId} (ghs_*${expires})`);
  return nextEnv;
}

function readGitHubAppCredentials(env: NodeJS.ProcessEnv): GitHubAppCredentials | undefined {
  if (!hasGitHubAppCredentials(env)) {
    return undefined;
  }
  const selectors = selectedInstallationTargets(env);
  if (selectors.length > 1) {
    throw new Error(`Set only one GitHub App installation selector: ${githubAppSelectorEnvVars.join(", ")}`);
  }

  return {
    appId: env.GITHUB_APP_ID!.trim(),
    installationId: env.GITHUB_APP_INSTALLATION_ID?.trim(),
    account: env.GITHUB_APP_INSTALLATION_ACCOUNT?.trim(),
    repository: normalizeRepository(env.GITHUB_APP_REPOSITORY),
    privateKey: readPrivateKey(env),
  };
}

function normalizePrivateKey(value: string): string {
  return value.trim().replace(/\r\n/g, "\n").replace(/\\n/g, "\n");
}

function privateKeySource(env: NodeJS.ProcessEnv): (typeof githubAppPrivateKeyEnvVars)[number] | undefined {
  return githubAppPrivateKeyEnvVars.find((name) => env[name]?.trim());
}

function selectedInstallationTargets(env: NodeJS.ProcessEnv): Array<{ name: (typeof githubAppSelectorEnvVars)[number]; value: string }> {
  return githubAppSelectorEnvVars
    .map((name) => ({ name, value: name === "GITHUB_APP_REPOSITORY" ? normalizeRepository(env[name]) : env[name]?.trim() }))
    .filter((item): item is { name: (typeof githubAppSelectorEnvVars)[number]; value: string } => Boolean(item.value));
}

function normalizeRepository(value: string | undefined): string | undefined {
  const repository = value?.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!repository) {
    return undefined;
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error(`GITHUB_APP_REPOSITORY must be in owner/repo format, got: ${repository}`);
  }
  return repository;
}

function readPrivateKey(env: NodeJS.ProcessEnv): string {
  if (env.GITHUB_APP_PRIVATE_KEY_PATH?.trim()) {
    return normalizePrivateKey(readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH.trim(), "utf8"));
  }
  if (env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim()) {
    return normalizePrivateKey(Buffer.from(env.GITHUB_APP_PRIVATE_KEY_BASE64.trim(), "base64").toString("utf8"));
  }
  if (env.GITHUB_APP_PRIVATE_KEY?.trim()) {
    return normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  }

  throw new Error(`Missing GitHub App private key. Set one of: ${githubAppPrivateKeyEnvVars.join(", ")}`);
}

async function createInstallationAccessToken(
  credentials: GitHubAppCredentials,
): Promise<{ token: string; expiresAt?: string; installationId: string }> {
  const jwt = createAppJwt(credentials.appId, credentials.privateKey);
  const installationId = credentials.installationId ?? (await resolveInstallationId(jwt, credentials));
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
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
    if (response.status === 404) {
      throw new Error(
        [
          `Failed to create GitHub App installation token for installation ${installationId} (404 Not Found)${message}.`,
          `Check that GITHUB_APP_INSTALLATION_ID belongs to GitHub App ${credentials.appId}, the app is installed on the target account, and the private key is from the same app.`,
          "To avoid manual installation id mistakes, remove GITHUB_APP_INSTALLATION_ID and set GITHUB_APP_INSTALLATION_ACCOUNT, or leave selectors unset when the app has exactly one installation.",
        ].join(" "),
      );
    }
    throw new Error(`Failed to create GitHub App installation token (${response.status} ${response.statusText})${message}`);
  }

  return {
    token: body.token,
    expiresAt: body.expires_at,
    installationId,
  };
}

async function resolveInstallationId(jwt: string, credentials: GitHubAppCredentials): Promise<string> {
  if (credentials.repository) {
    return resolveRepositoryInstallationId(jwt, credentials);
  }

  const installations = await listInstallations(jwt, credentials.appId);
  if (credentials.account) {
    const installation = installations.find(
      (item) => item.account?.login?.toLowerCase() === credentials.account?.toLowerCase(),
    );
    if (!installation?.id) {
      throw new Error(
        `GitHub App ${credentials.appId} has no installation for account ${credentials.account}. Check the account login or install the app there.`,
      );
    }
    return String(installation.id);
  }

  if (installations.length === 1 && installations[0]?.id) {
    return String(installations[0].id);
  }

  const accounts = installations.map((item) => item.account?.login).filter(Boolean).join(", ") || "none";
  throw new Error(
    [
      `GitHub App ${credentials.appId} has ${installations.length} installations (${accounts}).`,
      "Set GITHUB_APP_INSTALLATION_ACCOUNT to choose one, or set GITHUB_APP_INSTALLATION_ID explicitly.",
    ].join(" "),
  );
}

async function resolveRepositoryInstallationId(jwt: string, credentials: GitHubAppCredentials): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${credentials.repository}/installation`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "incident-agent",
    },
  });
  const body = (await response.json().catch(() => ({}))) as RepositoryInstallationResponse;

  if (!response.ok || !body.id) {
    const message = body.message ? `: ${body.message}` : "";
    throw new Error(
      [
        `Failed to resolve GitHub App installation for ${credentials.repository} (${response.status} ${response.statusText})${message}.`,
        `Check that GitHub App ${credentials.appId} is installed on that repository and the private key belongs to the same app.`,
      ].join(" "),
    );
  }

  return String(body.id);
}

async function listInstallations(jwt: string, appId: string): Promise<GitHubInstallation[]> {
  const installations: GitHubInstallation[] = [];

  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/app/installations?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "incident-agent",
      },
    });
    const body = (await response.json().catch(() => [])) as GitHubInstallation[] | { message?: string };

    if (!response.ok || !Array.isArray(body)) {
      const message = !Array.isArray(body) && body.message ? `: ${body.message}` : "";
      throw new Error(
        `Failed to list installations for GitHub App ${appId} (${response.status} ${response.statusText})${message}. Check the app id and private key.`,
      );
    }

    installations.push(...body);
    if (body.length < 100) {
      return installations;
    }
  }
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
