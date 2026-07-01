# Agent Requirements

This file defines repository-level rules for future Codex/agent work in this project. Read it before making code changes.

## Frontend Module Boundary Rules

The frontend must be organized around isolated tool modules. Each tool module owns its own UI, state, validation, request building, result rendering, and visualization logic.

### Required Structure

When the frontend is migrated to a component framework, use this shape:

```text
frontend/src/
  app/
    App.tsx
    routes.tsx
  api/
    jobs.ts
    tools.ts
  shared/
    components/
    hooks/
    utils/
    types/
  tools/
    mafft/
      MafftPanel.tsx
      mafftTypes.ts
      mafftApi.ts
    msa-quality/
      MsaQualityPanel.tsx
      MsaQualityReport.tsx
      AlignmentBrowser.tsx
      QualityTracks.tsx
      IdentityHeatmap.tsx
      ConsensusPanel.tsx
      msaQualityTypes.ts
      msaQualityApi.ts
```

For the current single-file frontend, preserve the same boundary logically: each tool's DOM ids, state, payload builder, controls loader, and result renderer must remain grouped and must not depend on another tool's private variables.

### No Cross-Module Calls

Do not let one tool module directly call another tool module's components, state functions, payload builders, or result renderers.

Disallowed examples:

```text
mafft -> calls MsaQualityPanel internals
msa-quality -> imports mafft/MafftPanel
primer -> reads mafft state
blast -> reuses fasta_generator private parser directly
```

Allowed communication paths:

```text
tool module -> shared component
tool module -> shared utility
tool module -> backend API
tool module -> typed result object passed by parent orchestration
```

If two modules need the same behavior, move it into `shared/` instead of importing from one tool module into another.

### Shared Code Rules

Shared code must be generic and domain-neutral unless it lives under a clearly named domain package.

Allowed shared examples:

```text
shared/components/FilePicker
shared/components/ResultFiles
shared/utils/fasta
shared/utils/download
shared/types/job
```

Not allowed in shared:

```text
shared/utils/mafftSpecialCase
shared/components/MsaQualityOnlyButton
```

### MSA_quality Rules

`MSA_quality` is an independent analysis/report module. It must not be treated as a visual sub-block inside MAFFT.

MAFFT responsibility:

```text
input sequences -> run MAFFT -> aligned.fasta -> job result
```

MSA_quality responsibility:

```text
aligned.fasta -> quality metrics -> visualization report -> downloadable outputs
```

MAFFT may offer a workflow action like "Analyze alignment quality", but it must call the backend/API or parent orchestration. It must not directly invoke MSA_quality component internals.

### Visualization Rules For MSA_quality

MSA_quality should prioritize visual interpretation over raw tables.

Required visual areas:

```text
Overview summary cards
Gap / conservation / entropy tracks
Per-sequence gap chart
Identity matrix heatmap
Consensus sequence and support view
Problematic regions table with coordinate links
Alignment browser with fixed sequence names and position ruler
```

The alignment browser should use windowed rendering for long alignments. Do not render extremely long alignments as one giant DOM block.

### State Isolation

Each module owns its own local state. Avoid global mutable state for tool-specific values.

Allowed:

```text
MafftPanel owns mafft form state
MsaQualityReport owns selected region / viewer window state
App owns selected tool and current job
```

Not allowed:

```text
global selectedSequence shared across unrelated tools
module A mutates module B state
hidden DOM state used as source of truth across tools
```

### API Boundary

Backend interactions should be wrapped in API helpers. UI components should not spread raw `fetch` calls everywhere.

Preferred:

```text
api/jobs.ts
  submitJob(toolName, payload)
  getJob(jobId)
  fileUrl(jobId, fileName)
```

Tool modules may define typed payload helpers, but generic HTTP behavior belongs in `api/`.

### Naming

Use stable tool names:

```text
mafft_alignment
MSA_quality
```

Use display names:

```text
MAFFT 多序列比对
MSA Quality
```

Do not rename public tool identifiers casually, because saved jobs, frontend routing, and result rendering may depend on them.

### Testing / Validation

Before finishing frontend-related changes:

```text
1. Run the frontend initialization check if present.
2. Run backend unit tests if backend contracts changed.
3. Verify that switching tools still works.
4. Verify that the changed tool can build a request payload.
5. Verify that unrelated tool controls are hidden when switching away.
```

For the current frontend, run:

```bash
node frontend/check_inline_script.js
```

For backend changes, run:

```bash
PYTHONPATH=backend uv run python -m unittest discover backend/app/tests
```

### Migration Guidance

If the frontend is migrated away from the current single `frontend/index.html`, prefer:

```text
React + Vite + TypeScript
```

Recommended visualization libraries:

```text
ECharts for heatmaps and quality tracks
React/CSS grid for the first version of the alignment browser
Canvas only when alignment size makes DOM rendering too slow
```

Migrate incrementally. Start with MAFFT and MSA_quality, then move other tools one by one.

