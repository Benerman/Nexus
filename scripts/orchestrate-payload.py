#!/usr/bin/env python3
"""orchestrate-payload.py

Builds the Paperclip issue-create JSON payload for the Orchestrator agent and
prints it to stdout. Used by .github/workflows/orchestrate.yml.

Every input arrives through the environment or a file on disk, never through
argv or shell interpolation, so pull-request-controlled text (the PR title and
the diff itself) can never be interpreted as shell or YAML.

Environment variables:
  PR_NUMBER              Pull request number                        (required)
  PR_URL                 Pull request html_url                      (required)
  PR_TITLE               Pull request title                         (required)
  BASE_SHA               Short base SHA                             (required)
  HEAD_SHA               Short head SHA                             (required)
  DIFF_FILE              Path to the diff                    (default /tmp/diff.txt)
  ORCHESTRATOR_AGENT_ID  Assignee agent UUID       (default DEFAULT_AGENT_ID below)
  PAPERCLIP_GOAL_ID      Goal to attach to          (default DEFAULT_GOAL_ID below)

Usage:
  python3 scripts/orchestrate-payload.py > /tmp/payload.json
"""

import json
import os
import sys

# Orchestrator agent and Nexus platform goal (Nexus company in Paperclip).
DEFAULT_AGENT_ID = "50750663-3cb9-4b0c-817d-2ad2cce3bb0e"
DEFAULT_GOAL_ID = "9f57e035-3ca0-43a4-b3bf-35ef8bdcf722"

# Keep the task title inside Paperclip's limit.
MAX_TITLE_CHARS = 50

REQUIRED = ("PR_NUMBER", "PR_URL", "PR_TITLE", "BASE_SHA", "HEAD_SHA")


def env_or_default(name, default):
    """Return the environment value, falling back when unset *or* empty.

    Actions sets unconfigured secrets to the empty string rather than leaving
    them unset, so `os.environ.get(name, default)` would not be enough.
    """
    value = os.environ.get(name, "")
    return value if value else default


def main():
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        sys.exit("orchestrate-payload: missing required env: " + ", ".join(missing))

    diff_file = env_or_default("DIFF_FILE", "/tmp/diff.txt")
    try:
        with open(diff_file, encoding="utf-8", errors="replace") as handle:
            diff = handle.read()
    except OSError as exc:
        sys.exit("orchestrate-payload: cannot read %s: %s" % (diff_file, exc))

    pr_number = os.environ["PR_NUMBER"]
    pr_url = os.environ["PR_URL"]
    pr_title = os.environ["PR_TITLE"]
    base_sha = os.environ["BASE_SHA"]
    head_sha = os.environ["HEAD_SHA"]

    title = "Orchestrate: PR #%s — %s" % (pr_number, pr_title[:MAX_TITLE_CHARS])

    description = """## Diff to Orchestrate

**PR:** [#{pr_number}]({pr_url})
**Base:** `{base_sha}` → **Head:** `{head_sha}`

Please analyze this diff and:
1. Map changed files to features in `nexus-specs/features/`
2. Produce a dispatch plan (which of Reviewer, Tester, SecurityAuditor to trigger)
3. Create Paperclip tasks for each agent in the dispatch plan
4. Flag any cross-cutting concerns or manual review items

```diff
{diff}
```
""".format(
        pr_number=pr_number,
        pr_url=pr_url,
        base_sha=base_sha,
        head_sha=head_sha,
        diff=diff,
    )

    payload = {
        "title": title,
        "description": description,
        "assigneeAgentId": env_or_default("ORCHESTRATOR_AGENT_ID", DEFAULT_AGENT_ID),
        "goalId": env_or_default("PAPERCLIP_GOAL_ID", DEFAULT_GOAL_ID),
        "status": "todo",
        "priority": "high",
    }

    print(json.dumps(payload))


if __name__ == "__main__":
    main()
