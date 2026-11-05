import unittest

import plan_gate as gate

PLAN = gate.load_plan()
DONE_TODAY = {"P0", "P1", "P8"}


def skip(part):
    return {"part": part, "kind": "skip", "reason": "r", "by": "b", "date": "d"}


def early(part):
    return {"part": part, "kind": "start-early", "reason": "r", "by": "b", "date": "d"}


class PartsIn(unittest.TestCase):
    def test_reads_step_ids_from_branch_names(self):
        self.assertEqual(gate.parts_in("feat/p4-seat-holds-dos"), ["P4"])
        self.assertEqual(gate.parts_in("feat/p16-promo-dima"), ["P16"])
        self.assertEqual(gate.parts_in("P9"), ["P9"])
        self.assertEqual(gate.parts_in("feat/p3-p4-combined"), ["P3", "P4"])

    def test_ignores_names_that_only_look_similar(self):
        self.assertEqual(gate.parts_in("feature/report4-milestones"), [])
        self.assertEqual(gate.parts_in("feat/frontend-f0"), [])
        self.assertEqual(gate.parts_in("biweekly-report-3"), [])


class Ordering(unittest.TestCase):
    def allowed(self, name, done=DONE_TODAY, overrides=()):
        return gate.verdict(name, PLAN, set(done), list(overrides))[0]

    def test_requested_examples(self):
        self.assertTrue(self.allowed("feat/p1-auth", done={"P0"}))
        self.assertTrue(self.allowed("feat/p2-events", done={"P0", "P1"}))
        self.assertFalse(self.allowed("feat/p9-notifications-yernur", done={"P0", "P1"}))

    def test_same_phase_parts_run_in_parallel(self):
        self.assertTrue(self.allowed("feat/p2-events", done={"P0"}))

    def test_next_phase_waits_for_all_of_the_current_one(self):
        self.assertFalse(self.allowed("feat/p3-inventory"))
        self.assertTrue(self.allowed("feat/p3-inventory", done=DONE_TODAY | {"P2"}))

    def test_merged_part_keeps_accepting_follow_up_branches(self):
        self.assertTrue(self.allowed("feat/p8-pdf-fix"))

    def test_merged_part_does_not_unlock_its_phase(self):
        self.assertEqual(gate.startable(PLAN, DONE_TODAY, []), ["P2"])

    def test_unknown_step_is_rejected(self):
        self.assertFalse(self.allowed("feat/p17-new"))

    def test_combined_branch_needs_every_part_open(self):
        self.assertFalse(self.allowed("feat/p2-p9-mix"))

    def test_non_plan_branches_are_not_gated(self):
        self.assertTrue(self.allowed("feat/frontend-f1"))

    def test_start_early_opens_only_that_part(self):
        overrides = [early("P9")]
        self.assertTrue(self.allowed("feat/p9-x", overrides=overrides))
        self.assertFalse(self.allowed("feat/p10-x", overrides=overrides))

    def test_start_early_does_not_count_as_finished(self):
        overrides = [early("P2")]
        self.assertFalse(self.allowed("feat/p3-x", overrides=overrides))

    def test_skip_lets_later_phases_open(self):
        finished = {f"P{n}" for n in (0, 1, 2, 3, 4, 5, 6, 7, 8, 15, 16)}
        self.assertFalse(self.allowed("feat/p9-x", done=finished))
        self.assertTrue(self.allowed("feat/p9-x", done=finished, overrides=[skip("P14")]))


class CreatedBranches(unittest.TestCase):
    def test_detects_each_way_of_creating_a_branch(self):
        cases = {
            "git checkout -b feat/p9-x": ["feat/p9-x"],
            "git checkout -b feat/p9-x origin/master": ["feat/p9-x"],
            "git switch -c feat/p9-x": ["feat/p9-x"],
            "git switch --create=feat/p9-x": ["feat/p9-x"],
            "git branch feat/p9-x": ["feat/p9-x"],
            "git branch -m old feat/p9-x": ["feat/p9-x"],
            "git worktree add -b feat/p9-x ../wt": ["feat/p9-x"],
            "git -C /some/path checkout -b feat/p9-x": ["feat/p9-x"],
            "cd backend && git checkout -b feat/p9-x": ["feat/p9-x"],
            "git fetch\ngit checkout -b feat/p9-x": ["feat/p9-x"],
            "FOO=1 git switch -c feat/p9-x": ["feat/p9-x"],
        }
        for command, expected in cases.items():
            with self.subTest(command):
                self.assertEqual(gate.created_branches(command), expected)

    def test_ignores_commands_that_create_nothing(self):
        for command in (
            "git status",
            "git branch",
            "git branch -a",
            "git branch -d feat/p9-x",
            "git branch --list feat/p9-x",
            "git checkout master",
            "git checkout feat/p2-events",
            'git commit -m "docs: git checkout -b feat/p9-x"',
            "echo git checkout -b feat/p9-x",
            "ls -la",
        ):
            with self.subTest(command):
                self.assertEqual(gate.created_branches(command), [])


if __name__ == "__main__":
    unittest.main()
