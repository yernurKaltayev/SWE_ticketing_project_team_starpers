#!/usr/bin/env python3
"""Keep BiletFlow plan steps (P0-P16) in timeline order.

A part may start once every part in the earlier phases of phases.json is merged
into the base branch or skipped with a logged override. Parts in the same phase
run in parallel. The skill, the Claude Code hook and CI all call this script, so
they always reach the same verdict.

Commands:
  status                                      show progress and what can start
  check <branch-or-part>                      exit 0 if allowed, 1 if blocked
  override <part> --reason R --by NAME [--skip]   log an exception
  hook                                        PreToolUse hook (JSON on stdin)
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
PHASES_FILE = SKILL_DIR / "phases.json"
OVERRIDES_FILE = SKILL_DIR / "overrides.json"

# A step id as its own branch-name segment: feat/p9-x and P9 match, report4 does not.
PART_RE = re.compile(r"(?:^|[/_-])p(\d+)(?=[/_-]|$)", re.IGNORECASE)
MERGE_RE = re.compile(r"^Merge pull request #\d+ from [^/\s]+/(\S+)")

SHELL_OPERATORS = set("();|&<>")
GIT_OPTIONS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
CREATE_FLAGS = {"-b", "-B", "-c", "-C", "--create", "--force-create", "--orphan"}
BRANCH_RENAME_FLAGS = {"-m", "-M", "-c", "-C", "--move", "--copy"}
BRANCH_NON_CREATE_FLAGS = {
    "-d", "-D", "--delete", "-a", "--all", "-r", "--remotes", "-l", "--list",
    "-v", "-vv", "--verbose", "--show-current", "--contains", "--no-contains",
    "--merged", "--no-merged", "--points-at", "-u", "--unset-upstream",
    "--edit-description",
}


def parts_in(name: str) -> list[str]:
    """Return the plan parts named by a branch name or bare part id."""
    return [f"P{int(number)}" for number in PART_RE.findall(name)]


def load_plan() -> dict:
    return json.loads(PHASES_FILE.read_text())


def load_overrides() -> list[dict]:
    if not OVERRIDES_FILE.exists():
        return []
    return json.loads(OVERRIDES_FILE.read_text())["overrides"]


def git(*args: str, timeout: int = 20) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(SKILL_DIR), *args],
        capture_output=True, text=True, timeout=timeout,
    )


def base_ref(base_branch: str) -> str:
    remote = f"origin/{base_branch}"
    found = git("rev-parse", "--verify", "--quiet", remote).returncode == 0
    return remote if found else base_branch


def refresh_base(base_branch: str) -> None:
    """Best-effort fetch, so a stale clone doesn't block a part that just opened."""
    try:
        git("fetch", "--quiet", "origin", base_branch, timeout=8)
    except subprocess.TimeoutExpired:
        pass


def merged_parts(base_branch: str) -> set[str]:
    """Read finished parts from the PR merge commits on the base branch."""
    result = git(
        "log", "--first-parent", "--merges", "--format=%s", base_ref(base_branch)
    )
    if result.returncode != 0:
        raise RuntimeError(f"cannot read git history: {result.stderr.strip()}")
    done: set[str] = set()
    for subject in result.stdout.splitlines():
        match = MERGE_RE.match(subject)
        if match:
            done.update(parts_in(match.group(1)))
    return done


def satisfied(done: set[str], overrides: list[dict]) -> set[str]:
    skipped = {o["part"] for o in overrides if o.get("kind") == "skip"}
    return done | skipped


def blockers(
    part: str, plan: dict, done: set[str], overrides: list[dict]
) -> list[str]:
    """Return the unfinished parts stopping `part` from starting."""
    if part in done or any(o["part"] == part for o in overrides):
        return []
    finished = satisfied(done, overrides)
    missing: list[str] = []
    for phase in plan["phases"]:
        if part in phase["parts"]:
            return missing
        missing.extend(p for p in phase["parts"] if p not in finished)
    raise KeyError(part)


def startable(plan: dict, done: set[str], overrides: list[dict]) -> list[str]:
    return [
        part
        for phase in plan["phases"]
        for part in phase["parts"]
        if part not in satisfied(done, overrides)
        and not blockers(part, plan, done, overrides)
    ]


def describe(part: str, plan: dict) -> str:
    info = plan["parts"][part]
    return f"{part} {info['title']} ({info['owner']})"


def verdict(
    name: str, plan: dict, done: set[str], overrides: list[dict]
) -> tuple[bool, str]:
    """Decide whether a branch or part may proceed, and explain why."""
    parts = parts_in(name)
    if not parts:
        note = f"{name}: not a plan step, so it is not gated."
        if name.startswith("feat/"):
            note += " Backend work should be named feat/<step>-<short-name>-<owner>."
        return True, note

    unknown = [p for p in parts if p not in plan["parts"]]
    if unknown:
        return False, f"{name}: {', '.join(unknown)} is not a step in the plan."

    missing: list[str] = []
    for part in parts:
        missing.extend(m for m in blockers(part, plan, done, overrides) if m not in missing)
    if missing:
        ready = ", ".join(startable(plan, done, overrides)) or "none"
        return False, "\n".join(
            [
                f"Blocked: {name} is out of order.",
                "Finish these first:",
                *[f"  - {describe(m, plan)}" for m in missing],
                f"Can start now: {ready}",
                "To make an exception, log one with the plan-gate override command.",
            ]
        )

    logged = [o for o in overrides if o["part"] in parts]
    lines = [f"Allowed: {name} ({', '.join(parts)})."]
    lines += [
        f"Override ({o['kind']}) by {o['by']} on {o['date']}: {o['reason']}"
        for o in logged
        if not set(parts) <= done
    ]
    return True, "\n".join(lines)


def created_branches(command: str) -> list[str]:
    """Return the branches a shell command would create.

    Tokenizing rather than regex-matching keeps quoted text such as a commit
    message that mentions `git checkout -b` from being read as a real command.
    """
    try:
        lexer = shlex.shlex(
            command.replace("\n", " ; "), posix=True, punctuation_chars=True
        )
        lexer.whitespace_split = True
        lexer.commenters = ""
        tokens = list(lexer)
    except ValueError:
        return []

    segments: list[list[str]] = [[]]
    for token in tokens:
        if set(token) <= SHELL_OPERATORS:
            segments.append([])
        else:
            segments[-1].append(token)

    branches: list[str] = []
    for segment in segments:
        branches.extend(_branches_from_git_command(segment))
    return branches


def _branches_from_git_command(tokens: list[str]) -> list[str]:
    index = 0
    while index < len(tokens) and re.match(r"^\w+=", tokens[index]):
        index += 1  # leading VAR=value assignments
    if index >= len(tokens) or Path(tokens[index]).name != "git":
        return []
    index += 1
    while index < len(tokens) and tokens[index].startswith("-"):
        index += 2 if tokens[index] in GIT_OPTIONS_WITH_VALUE else 1
    if index >= len(tokens):
        return []

    subcommand, args = tokens[index], tokens[index + 1:]
    if subcommand in ("checkout", "switch"):
        return _flag_values(args)
    if subcommand == "worktree" and args[:1] == ["add"]:
        return _flag_values(args[1:])
    if subcommand == "branch":
        if BRANCH_NON_CREATE_FLAGS & set(args):
            return []
        positional = [a for a in args if not a.startswith("-")]
        if not positional:
            return []
        renaming = BRANCH_RENAME_FLAGS & set(args)
        return [positional[-1] if renaming else positional[0]]
    return []


def _flag_values(args: list[str]) -> list[str]:
    values: list[str] = []
    for position, arg in enumerate(args):
        if arg in CREATE_FLAGS and position + 1 < len(args):
            values.append(args[position + 1])
        elif arg.startswith(("--create=", "--force-create=", "--orphan=")):
            values.append(arg.split("=", 1)[1])
    return values


def cmd_status(_: argparse.Namespace) -> int:
    plan = load_plan()
    overrides = load_overrides()
    refresh_base(plan["base_branch"])
    done = merged_parts(plan["base_branch"])
    finished = satisfied(done, overrides)

    print(f"Plan progress on {base_ref(plan['base_branch'])}\n")
    for number, phase in enumerate(plan["phases"], start=1):
        print(f"Phase {number} - {phase['name']}")
        for part in phase["parts"]:
            if part in done:
                state = "done"
            elif part in finished:
                state = "skipped"
            elif blockers(part, plan, done, overrides):
                state = "locked"
            else:
                state = "can start"
            print(f"  [{state}] {describe(part, plan)}")
    print("\nCan start now:")
    for part in startable(plan, done, overrides):
        print(f"  - {describe(part, plan)}")
    if overrides:
        print("\nLogged overrides:")
        for o in overrides:
            print(f"  - {o['part']} {o['kind']}, {o['by']}, {o['date']}: {o['reason']}")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    plan = load_plan()
    refresh_base(plan["base_branch"])
    allowed, message = verdict(
        args.target, plan, merged_parts(plan["base_branch"]), load_overrides()
    )
    print(message)
    return 0 if allowed else 1


def cmd_override(args: argparse.Namespace) -> int:
    plan = load_plan()
    part = (parts_in(args.part) or [""])[0]
    if part not in plan["parts"]:
        print(f"{args.part} is not a step in the plan.", file=sys.stderr)
        return 1
    if not args.reason.strip() or not args.by.strip():
        print("An override needs a reason and a name.", file=sys.stderr)
        return 1

    overrides = load_overrides()
    overrides.append(
        {
            "part": part,
            "kind": "skip" if args.skip else "start-early",
            "reason": args.reason.strip(),
            "by": args.by.strip(),
            "date": datetime.date.today().isoformat(),
        }
    )
    OVERRIDES_FILE.write_text(json.dumps({"overrides": overrides}, indent=2) + "\n")
    print(f"Logged in {OVERRIDES_FILE}. Commit it so reviewers see it in the PR.")
    return 0


def cmd_hook(_: argparse.Namespace) -> int:
    """Exit 2 blocks the tool call. A gate failure allows it, since CI still checks."""
    try:
        payload = json.load(sys.stdin)
        command = payload.get("tool_input", {}).get("command", "")
        branches = [b for b in created_branches(command) if parts_in(b)]
        if not branches:
            return 0
        plan = load_plan()
        refresh_base(plan["base_branch"])
        done = merged_parts(plan["base_branch"])
        overrides = load_overrides()
        for branch in branches:
            allowed, message = verdict(branch, plan, done, overrides)
            if not allowed:
                print(message, file=sys.stderr)
                return 2
    except Exception as error:  # noqa: BLE001 - a gate bug must not stop all Bash
        print(f"plan-gate could not check this command: {error}", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("status").set_defaults(run=cmd_status)
    commands.add_parser("hook").set_defaults(run=cmd_hook)

    check = commands.add_parser("check")
    check.add_argument("target", help="branch name or part id, e.g. P9")
    check.set_defaults(run=cmd_check)

    override = commands.add_parser("override")
    override.add_argument("part")
    override.add_argument("--reason", required=True)
    override.add_argument("--by", required=True)
    override.add_argument(
        "--skip", action="store_true",
        help="drop the part so later phases can open, instead of starting it early",
    )
    override.set_defaults(run=cmd_override)

    args = parser.parse_args()
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())
