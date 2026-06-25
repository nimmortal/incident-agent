from pathlib import Path


path = Path("/usr/local/lib/hermes-agent/hermes_cli/copilot_auth.py")
text = path.read_text()

old = '"Copilot-Integration-Id": "vscode-chat",'
new = '"Copilot-Integration-Id": os.getenv("COPILOT_INTEGRATION_ID", "copilot-developer-cli"),'

if old not in text:
    raise SystemExit("Hermes Copilot integration header changed")

path.write_text(text.replace(old, new))
