# agents.md

<purpose>
Multi-agent coordination model for Starkzap tasks. Use this when work is split across planning, implementation, and review agents.
</purpose>

<roles>
| Role | Responsibility | Does NOT |
| --- | --- | --- |
| Coordinator | Scope task, map files, define plan, assign owners, track state | Implement code changes directly |
| Executor | Implement assigned changes and report blockers quickly | Redefine scope or approve own work |
| Reviewer | Validate behavior, risks, and boundary compliance | Introduce new feature scope |
</roles>

<delegation>
For each new task:
1. Investigation phase (high-context model)
- Identify affected modules and files.
- List risks, compatibility concerns, and required approvals.
- Produce a small execution plan with acceptance criteria.
2. Execution phase (efficient model)
- Implement exactly the plan.
- Keep edits scoped to assigned files.
- Escalate immediately on blocker or scope mismatch.
</delegation>

<task_states>
`todo -> inprogress -> inreview -> done`
`inprogress -> blocked`
`todo|inprogress -> cancelled`

Transition rules:
- `todo -> inprogress`: owner assigned and file scope agreed.
- `inprogress -> inreview`: implementation complete with summary.
- `inreview -> done`: reviewer approves.
- `inprogress -> blocked`: unresolved dependency or decision needed.
</task_states>

<task_template>
## [Type]: [Title]

### Problem
[1-2 sentence problem statement]

### Context
- Relevant files:
- Dependencies/services:
- Risks:

### Acceptance Criteria
- [ ] Behavior implemented
- [ ] Tests updated or explicitly deferred
- [ ] Boundaries respected

### Scope Boundaries
- Not included:
</task_template>

<parallelization>
SAFE TO PARALLELIZE:
- JSDoc-only edits vs SDK logic in `src/`
- Independent modules (`src/erc20/` vs `src/staking/`) when exports do not overlap
- Test additions in separate files from implementation files

MUST SERIALIZE:
- Any work touching `src/index.ts` (public API export surface)
- Concurrent edits in `src/sdk.ts`, `src/wallet/*`, or shared `src/types/*`
- Generated artifact updates (`src/erc20/token/presets*.ts`, `src/staking/validator/presets*.ts`)
- Dependency updates (`package.json`, `package-lock.json`)

Conflict resolution:
1. Detect overlapping file ownership before execution.
2. Pause the later task.
3. Merge or apply first task.
4. Rebase/reconcile second task scope.
5. Re-run targeted validation for reconciled files.
</parallelization>

<handoff>
Executor handoff must include:
- Changed files list
- Behavior changes and non-changes
- Commands run (or intentionally not run)
- Known risks and follow-ups
</handoff>

<escalation>
Escalate when:
- Blocked >30 minutes
- Required decision exceeds assigned scope
- Security/credential concern appears
- Breaking API change is required
- Generated files differ from script output expectations

Format:
## Escalation: [Title]
**Task**: [reference]
**Blocker**: [what is blocking]
**Options**:
1. [Option A] - [tradeoff]
2. [Option B] - [tradeoff]
**Recommendation**: [best option and why]
</escalation>

<project_specific_guards>
- Never hand-edit generated preset files; run scripts.
- Treat `docs/api/**` and `docs/export/**` as generated outputs.
- Never commit secrets from `.env*`.
- Require human approval for publish/release or dependency changes.
</project_specific_guards>
