import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFeatures } from "./features.ts";
import { atlassianReadOnlyTools, confluenceKnowledgeReadOnlyTools, delegationModel } from "./hermes-config.ts";

test("enables pinned Confluence knowledge when the shared MCP and folder are configured", () => {
  const shared = {
    JIRA_MCP_URL: "https://mcp.example.test",
    JIRA_MCP_TOKEN: "token",
  };

  const missingFolder = buildFeatures(shared);
  assert.equal(missingFolder.sources.confluence.enabled, false);
  assert.deepEqual(missingFolder.sources.confluence.missingEnv, ["CONFLUENCE_KNOWLEDGE_FOLDER"]);

  const configured = buildFeatures({
    ...shared,
    CONFLUENCE_KNOWLEDGE_FOLDER: "https://example.atlassian.net/wiki/spaces/OPS/folder/knowledge",
  });
  assert.equal(configured.sources.confluence.enabled, true);
});

test("adds the harness-owned Confluence tools only when knowledge is pinned", () => {
  assert.deepEqual(atlassianReadOnlyTools({ JIRA_MCP_READONLY_TOOLS: "get_issue" }), ["get_issue"]);
  assert.deepEqual(
    atlassianReadOnlyTools({
      JIRA_MCP_READONLY_TOOLS: "get_issue, search_issues",
      CONFLUENCE_KNOWLEDGE_FOLDER: "https://example.atlassian.net/wiki/spaces/OPS/folder/knowledge",
    }),
    ["get_issue", "search_issues", ...confluenceKnowledgeReadOnlyTools],
  );
  assert.throws(
    () => atlassianReadOnlyTools({ JIRA_MCP_READONLY_TOOLS: "get_issue,update_issue" }),
    /mutation-looking tools: update_issue/,
  );
});

test("uses Luna for delegated scouts unless explicitly overridden", () => {
  assert.equal(delegationModel({}), "gpt-5.6-luna");
  assert.equal(delegationModel({ HERMES_DELEGATION_MODEL: "" }), "gpt-5.6-luna");
  assert.equal(delegationModel({ HERMES_DELEGATION_MODEL: "custom-scout-model" }), "custom-scout-model");
});
