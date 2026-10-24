"""Secrets scan (Stage 9): every commit in the git history plus all tracked files, for API keys, private keys,
passwords in URLs and long secret-looking assignments. Prints findings masked, never the secret itself.
Exit code 1 if anything is found, so CI fails.   Usage: python infra/security/secret_scan.py .
"""

import re
import subprocess
import sys

repo = sys.argv[1]
PATTERNS = {
    "anthropic key": r"sk-ant-[A-Za-z0-9_-]{20,}",
    "openai-style key": r"\bsk-[A-Za-z0-9]{32,}",
    "aws access key": r"\bAKIA[0-9A-Z]{16}\b",
    "github token": r"\bgh[pousr]_[A-Za-z0-9]{36,}",
    "private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "slack token": r"\bxox[abpr]-[A-Za-z0-9-]{10,}",
    "google api key": r"\bAIza[0-9A-Za-z_-]{35}\b",
    "password in URL": r"[a-z+]+://[^\s:/@]+:([^\s@/]{6,})@",
    "assigned secret": r"(?i)\b(secret_key|api_key|password|token)\s*[=:]\s*['\"]?([A-Za-z0-9_\-+/=]{24,})",
}
# Known, deliberately public development/test values (local DB password, documented placeholders, test-only keys).
ALLOW = ["lifeos_dev_only", "lifeos_ci_only", "change-me", "e2e-only-secret-key", "e2e-password-123", "test-secret-key",
         "correct-horse-battery", "stage-password-123"]

log = subprocess.run(["git", "-C", repo, "log", "-p", "--all", "--no-color", "--format=COMMIT %h"],
                     capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
files = subprocess.run(["git", "-C", repo, "grep", "-I", "-n", "-e", "."], capture_output=True, text=True,
                       encoding="utf-8", errors="replace").stdout

findings = set()
commit = "?"
for source, text in (("history", log), ("tracked files", files)):
    for line in text.splitlines():
        if line.startswith("COMMIT "):
            commit = line.split()[1]
            continue
        for name, pat in PATTERNS.items():
            for m in re.finditer(pat, line):
                value = m.group(m.lastindex or 0)
                if any(a in line for a in ALLOW):
                    continue
                masked = value[:4] + "…" + value[-2:] if len(value) > 8 else "…"
                findings.add((source, name, commit if source == "history" else line.split(":", 1)[0], masked))

env_in_history = subprocess.run(["git", "-C", repo, "log", "--all", "--format=%h", "--", ".env"],
                                capture_output=True, text=True).stdout.strip()
print("`.env` ever committed:", "YES " + env_in_history if env_in_history else "no")
print("findings:", len(findings))
for f in sorted(findings):
    print("  ", *f)
sys.exit(1 if findings or env_in_history else 0)
