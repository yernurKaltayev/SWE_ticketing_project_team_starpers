---
name: plan-gate
description: Enforces the order of BiletFlow plan steps P0-P16 and blocks work on a step whose earlier phases aren't finished (P1 to P2 is fine, P1 to P9 is not). Use this before starting, implementing, planning or branching for any plan step or part, whenever someone says "start P5", "let's do notifications", "implement refunds", "next step", or "what can I work on", even if they name only the feature and not the P-number. Also use it to report plan progress, explain a blocked branch or failed Plan Gate check, or log an override.
---

# Plan gate

Keeps the backend plan in `CLAUDE.md` moving in timeline order, because later parts build on tables and services from earlier ones. Three layers share `scripts/plan_gate.py`, so they always agree:

- This skill checks the order before any work starts.
- A PreToolUse hook blocks Claude from creating an out-of-order branch.
- The `Plan Gate` GitHub Action fails out-of-order PRs, including work done without Claude.

## The rule

`phases.json` holds the order, taken from the CLAUDE.md timeline:

| Phase | Parts |
|---|---|
| 1 | P0 |
| 2 | P1, P2 |
| 3 | P3, P4, P5, P6, P8 |
| 4 | P16, P14, P7, P15 |
| 5 | P9, P10, P11, P12, P13 |

A part can start once every part in all earlier phases is finished. Parts in the same phase can run in parallel, so the three owners aren't queued behind each other.

A part is finished when a PR from a branch naming it is merged into `master`. Git history is the source of truth because router and service files exist for every part as placeholders and prove nothing. The first merged PR counts, and follow-up branches for a finished part are always allowed.

## Before starting a step

Map the request to its part using CLAUDE.md, even if the user named only a feature ("refunds" is P7). Then run this from the repo root:

```bash
python3 .claude/skills/plan-gate/scripts/plan_gate.py check P7
```

- **Exit 0:** continue, using the branch name `feat/<step>-<short-name>-<owner>`.
- **Exit 1:** stop before creating a branch or writing any code for that step. Show the user which parts are missing and who owns them, then offer the parts they can start now. Partial or "preparatory" work on a blocked step is still out-of-order work, so don't do it unless an override is logged.

For progress questions ("where are we?", "what's next?"), run `status` instead of `check`.

## Overrides

Only log an override when the user explicitly asks for one and gives their own reason. Don't suggest a reason, and never log one just to get past a block, because the point is that a person chooses to break the order and the team can see why.

```bash
# Start one part early. Later phases stay locked.
python3 .claude/skills/plan-gate/scripts/plan_gate.py override P9 --reason "..." --by "Name"

# Drop a part so later phases can open, e.g. P14, which the plan makes optional.
python3 .claude/skills/plan-gate/scripts/plan_gate.py override P14 --skip --reason "..." --by "Name"
```

This writes to `overrides.json`. Run it before creating the branch, then commit the file in the same PR so the reviewer sees the exception.

## Troubleshooting

- **A part was merged but still shows as unfinished.** Detection reads `Merge pull request #N from owner/<branch>` commits. A squash or rebase merge leaves no such commit, and neither does a branch name without the step id. Tell the user, and if the work really is finished, they can log a `--skip` override saying so.
- **The PR check failed but the blocking part has since merged.** The check doesn't rerun by itself. Push a commit or rerun the job.
- **Changing the order.** Edit `phases.json` in a PR and update the CLAUDE.md timeline to match.

Tests: `cd .claude/skills/plan-gate/scripts && python3 -m unittest test_plan_gate`
