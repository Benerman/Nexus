#!/usr/bin/env bash
# trigger-orchestrator.sh
#
# Creates a Paperclip task for the Orchestrator with the current diff.
# Usage:
#   ./scripts/trigger-orchestrator.sh [base_ref]
#
# Examples:
#   ./scripts/trigger-orchestrator.sh           # diff HEAD against HEAD~1 (last commit)
#   ./scripts/trigger-orchestrator.sh origin/develop   # diff HEAD against origin/develop
#   ./scripts/trigger-orchestrator.sh main             # diff HEAD against main
#
# Required environment variables (set in shell or GitHub Actions secrets):
#   PAPERCLIP_API_URL        e.g. http://localhost:3100
#   PAPERCLIP_API_KEY        Paperclip agent API key
#   PAPERCLIP_COMPANY_ID     Company UUID
#
# Optional:
#   PAPERCLIP_GOAL_ID        Goal to attach the task to (defaults to Nexus goal)
#   PAPERCLIP_PARENT_ID      Parent issue ID (for task hierarchy)

set -euo pipefail

BASE_REF="${1:-HEAD~1}"

# Validate required env vars
: "${PAPERCLIP_API_URL:?Must set PAPERCLIP_API_URL}"
: "${PAPERCLIP_API_KEY:?Must set PAPERCLIP_API_KEY}"
: "${PAPERCLIP_COMPANY_ID:?Must set PAPERCLIP_COMPANY_ID}"

# Orchestrator agent ID (Nexus company)
ORCHESTRATOR_AGENT_ID="50750663-3cb9-4b0c-817d-2ad2cce3bb0e"
GOAL_ID="${PAPERCLIP_GOAL_ID:-9f57e035-3ca0-43a4-b3bf-35ef8bdcf722}"

# Capture diff
echo "Generating diff: HEAD vs ${BASE_REF}..."
DIFF=$(git diff "${BASE_REF}" HEAD -- 2>/dev/null || git diff HEAD~1 HEAD --)

if [ -z "$DIFF" ]; then
  echo "No diff found between HEAD and ${BASE_REF}. Nothing to dispatch."
  exit 0
fi

# Truncate diff if too large (Paperclip task descriptions have limits)
MAX_DIFF_CHARS=20000
DIFF_LEN=${#DIFF}
if [ "$DIFF_LEN" -gt "$MAX_DIFF_CHARS" ]; then
  echo "Warning: Diff is ${DIFF_LEN} chars, truncating to ${MAX_DIFF_CHARS}..."
  DIFF="${DIFF:0:$MAX_DIFF_CHARS}"$'\n\n[TRUNCATED — diff exceeded limit]'
fi

# Get current branch and commit
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "")

TITLE="Orchestrate: ${BRANCH} @ ${COMMIT}"
if [ -n "$COMMIT_MSG" ]; then
  TITLE="Orchestrate: ${COMMIT_MSG:0:60}"
fi

DESCRIPTION=$(cat <<EODESC
## Diff to Orchestrate

**Branch:** \`${BRANCH}\`
**Commit:** \`${COMMIT}\`
**Base:** \`${BASE_REF}\`

Please analyze this diff and:
1. Map changed files to features in \`nexus-specs/features/\`
2. Produce a dispatch plan (which of Reviewer, Tester, SecurityAuditor to trigger)
3. Create Paperclip tasks for each agent in the dispatch plan
4. Flag any cross-cutting concerns or manual review items

\`\`\`diff
${DIFF}
\`\`\`
EODESC
)

# Build JSON payload
PAYLOAD=$(python3 -c "
import json, sys
payload = {
    'title': sys.argv[1],
    'description': sys.argv[2],
    'assigneeAgentId': sys.argv[3],
    'goalId': sys.argv[4],
    'status': 'todo',
    'priority': 'high'
}
print(json.dumps(payload))
" "$TITLE" "$DESCRIPTION" "$ORCHESTRATOR_AGENT_ID" "$GOAL_ID")

echo "Creating Orchestrator task..."
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${PAPERCLIP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "${PAPERCLIP_API_URL}/api/companies/${PAPERCLIP_COMPANY_ID}/issues")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  ISSUE_ID=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('identifier','unknown'))" 2>/dev/null || echo "unknown")
  echo "Orchestrator task created: ${ISSUE_ID}"
  echo "The Orchestrator will analyze the diff and dispatch Reviewer/Tester/SecurityAuditor as needed."
else
  echo "Error creating task (HTTP ${HTTP_CODE}):"
  echo "$BODY"
  exit 1
fi
