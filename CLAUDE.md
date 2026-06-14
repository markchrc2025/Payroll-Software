@AGENTS.md

# Workflow rules (standing instructions)

## Always ship changes via an auto-merged PR
For **every** change, follow this flow without being asked each time:
1. Develop on the designated feature branch and commit.
2. Push the branch.
3. Open a pull request into `main`.
4. **Automatically squash-merge that PR** (no need to ask for confirmation first).

Keep PRs atomic — one logical change per PR. This rule is a standing
authorization to create and squash-merge PRs; it overrides the default
"don't open a PR unless explicitly asked" guidance for this repository.
