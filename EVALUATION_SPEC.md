# Spec: Holiday Answer Evaluation

## Overview

A way to evaluate and compare holiday answers returned by Cloudflare Workers AI across models and modes (Base, LoRA, MCP) for a given list of test cases. Evaluations run headless on CI — no browser or UI involved. The results are persisted to Cloudflare R2 as JSON for tracking over time, with CSV export support.

This is a standalone CLI tool and CI pipeline, not part of the Next.js web app. It reads configuration from `.env.evaluation`.

---

## Problem & Opportunity Costs

### Why evaluate?

The app uses three different Workers AI execution modes (Base, LoRA, MCP) that may return inconsistent holiday lists for the same date. Without evaluation we do not know:

- Which mode is most accurate for each country/date pair
- Whether the fine-tuned LoRA adapter actually improves precision over the base model
- Whether MCP tool-calling introduces non-determinism or hallucination risk
- How accuracy varies by region, holiday type, and date complexity

### Opportunity costs of NOT building this

| What we lose | Impact |
|---|---|
| Empirical model comparison data | Continue guessing which mode is best for production use |
| Regression detection for prompts/models | No way to know if a prompt change hurt accuracy across 48 country/date pairs |
| Confidence in MCP output quality | MCP tool-calling adds complexity — but does it add accuracy? Unmeasured. |
| Structured feedback loop for improvement | Cannot prioritize which mode to improve or retire without results |

### What evaluation cannot solve (out of scope)

- Prompt engineering decisions (that comes after we have data)
- Live A/B testing in production (that is a next-phase concern)
- Ground-truth holiday database — evaluation uses hardcoded expected answers by necessity |

---

## Risks & Trade-offs if We Build It

### Technical risks

| Risk | Mitigation |
|---|---|
| Workers AI rate limits on `llama-3.1-8b-instruct-fp8-fast` (free tier: 10K neurons/day) | Reuse same model for MCP mode — only evaluate with `gemma-7b-it-lora` base and LoRA modes to conserve quota |
| Non-deterministic LLM outputs make evaluation flaky | Use fixed temperature (0), capture full raw response, allow tolerance matching |
| Free-tier API quotas exhausted mid-batch evaluation | Add per-request delays and batch-sized chunks with pause/resume |

### Strategic trade-offs

#### Build vs buy

- **Build ourselves:** Low cost (~free on free tier), full control over test cases and scoring logic. Higher engineering time investment and maintenance burden as we add countries.
- Buy a benchmarking service: Would give us standardized benchmarks and historical tracking out of the box, but there is no off-the-shelf product for Workers AI holiday-domain evaluation. We would also lose domain-specific test coverage.

#### Build a general-purpose evaluation framework vs build exactly what we need for now

| Approach | Pros | Cons |
|---|---|---|
| Exactly what we need (one-off CLI script) | Fast to build, simple to understand | Adding new evaluation dimensions later requires rewriting |
| General-purpose framework (configurable test cases, scoring profiles, persist layer) | Reusable across future Workers AI features, supports evolving metrics | More upfront design, more files and dependencies to maintain |

**Decision:** Build a general-purpose evaluation framework. This project is a learning/training exercise — understanding how to structure reproducible ML evaluation is valuable beyond holidays. We will use the simplest possible framework that still allows adding new scoring dimensions (accuracy, latency, token usage) without code changes.

### Other strategic trade-offs

- **Run on CI vs run locally:** CI gives repeatability and history tracking but requires infrastructure setup. We will support both — local CLI for iteration, GitHub Actions + Cloudflare R2 for persistent history.
- **Hardcoded expected answers vs external test corpus:** Hardcoding is fastest and most reliable for initial evaluation. A separate test corpus (CSV/JSON file) allows non-engineers to add test cases later. Support both: hardcoded defaults + external CSV override.

---

## Assumptions & Dependencies

### What we are assuming

- Ground-truth holiday data can be manually curated for a representative set of ~48 country/date pairs
- Workers AI free-tier quotas (10K neurons/day) are sufficient for evaluation batches when using temperature:0
- Cloudflare R2 free tier (10GB storage, 10K ops/day) can host evaluation results
- The three existing API routes produce comparable output formats that allow set-diff scoring

### What depends on what

```
evaluation-cli (code) ──needs──▶ Workers AI API (CLOUDFLARE_ACCOUNT_ID + TOKEN)
evaluation-cli (results) ──writes──▶ Cloudflare R2 bucket (R2_BUCKET_ID + KEY)
CI pipeline (.github/workflows/) ──runs──▶ evaluation-cli on schedule
```

No external dependencies beyond the existing Workers AI account and a new R2 bucket. The CLI itself depends only on Node.js 18+ and no ML/LLM-specific packages — all requests go to Workers AI REST API directly.

### Out of scope

- Ground-truth data collection (manually curated, not automated)
- Model training or fine-tuning from evaluation results
- UI for viewing evaluation results (CLI text + R2 JSON files only)
- Integration with the Next.js web app's runtime (evaluation is a separate toolchain)

---

## Requirements

### Must have

- [ ] Accepts configuration of test cases: each test has a date, country code, expected holiday names, and optional metadata (religion, type)
- [ ] Sends all three API routes (`holidays-base`, `holidays-lora`, `holidays-mcp`) for each test case
- [ ] Computes per-model scores: accuracy (holiday list match), latency (ms), token usage (if available in response)
- [ ] Persists evaluation results to R2 as timestamped JSON with raw responses, model metadata, and computed scores
- [ ] Exports results to CSV for spreadsheet analysis
- [ ] Runs headless via CLI command (`npx run evaluate`) without browser or UI
- [ ] Can be invoked from CI on a schedule (GitHub Actions workflow)

### Should have

- Configuration file (YAML/JSON) to define test cases instead of hardcoded values in code
- Summary output to console showing pass/fail breakdown per model and per country group
- Tolerance matching for fuzzy holiday name comparison (e.g., "Eid al-Fitr" vs "Eid ul-Fitr")

### Could have (nice to have)

- Historical trend tracking across evaluation runs
- Ability to weight specific countries or regions more heavily in scoring
- Dry-run mode that plans requests without making them (useful for quota management)
- Diff view comparing two evaluation runs to spot regressions

### Won't have (explicitly out of scope)

- Automated ground-truth collection or updating
- Integration with the Next.js web app as a feature — always a separate toolchain
- Model training or automated hyperparameter tuning
- Load testing or throughput benchmarking

---

## Design Decisions & Rationale

### Decision: Use Workers AI REST API directly, not a library.
- **Why:** Avoids hidden dependencies and keeps the CLI lightweight. Only native `fetch` is needed, consistent with the web app's pattern.
- **Alternative:** Use aWorkers AI SDK. Would reduce boilerplate but adds an extra dependency that is trivial to replace.

### Decision: Persist raw LLM responses, not just scores.
- **Why:** Enables manual review of outputs, debugging hallucinations, and future scoring improvements — without re-running all API calls.
- **Trade-off:** Increases storage size. R2 free tier (10GB) is ~35 hours of continuous logging at typical verbosity for our needs.

### Decision: Score model accuracy as set intersection over expected answer.
- **Why:** Holidays are discrete objects — a country either has the holiday or it does not. Simple set-diff scoring maps naturally to the domain.
- **Alternative:** Full NLP similarity (cosine, BLEU). Overkill for discrete holiday names.

### Decision: Evaluate only `gemma-7b-it-lora` base and LoRA modes; exclude MCP from automated evaluation.
- **Why:** Same model as base — isolates adapter quality without MCP tool-calling overhead. Conserves quota and avoids non-determinism from dynamic tool discovery.
- **Exception:** Manual MCP testing can still be done but won't be part of automated CI pipeline.

---

## Success Criteria

### Measurable success criteria (all must be met for "done")

1. Running the CLI against all test cases completes with a CSV file generated within 30 minutes on stable connection
2. For each model, a pass rate is computed for each country group with at least 95% confidence in scoring accuracy (scores are deterministic given fixed inputs)
3. Evaluation results persist across runs in R2 without overwriting previous data
4. CI pipeline triggers evaluation on schedule and comments on PR/commit with summary metrics

### Non-negotiables

- **Never commit test case ground-truth values** — store them in `.env.*` or separate untracked CSV, same as API keys
- **Never exceed Workers AI free-tier quotas** during evaluation — add configurable delays between requests
- **All results must be reproducible** given the same inputs and model versions

---

## Tasks & Implementation Phases

### Phase 1: Core CLI (MUST achieve)

- [ ] Scaffold evaluation directory structure with `package.json`, TypeScript config, `.env.evaluation.example`
- [ ] Define test case schema in TypeScript types (date, country code, expected holidays array, metadata)
- [ ] Implement Workers AI request builder for Base and LoRA API routes (native fetch only)
- [ ] Implement set-diff scoring function with configurable tolerance matching
- [ ] Build CLI entry point: iterate over test cases, send requests to both models, compute scores
- [ ] Output pass/fail summary to console per model and per country group
- [ ] Add `--export csv` flag that writes results to CSV file
- [ ] Test end-to-end locally with small batch (5 test cases)

### Phase 2: Persistence + CI (SHOULD achieve)

- [ ] Implement R2 upload module for timestamped JSON persistence
- [ ] Update `.env.evaluation.example` with R2 bucket credentials
- [ ] Create GitHub Actions workflow that runs evaluation on a weekly schedule
- [ ] Add CLI flag `--persist r2` to trigger R2 upload during local runs
- [ ] Verify results accumulate across runs without overwrite

### Phase 3: Improvements (NICE TO HAVE)

- [ ] Historical trend analysis from accumulated R2 data
- [ ] Evaluation diff view (`evaluate --diff run1 --run2`)
- [ ] Weighted scoring profile configuration for country/region priority
- [ ] Dry-run mode for quota planning
- [ ] Configurable test case loader from external JSON/YAML

---

## File Structure (Proposed)

```
evaluation/                       # new top-level directory
├── package.json                  # evaluation-specific deps and scripts
├── tsconfig.json                 # TypeScript config
├── .env.evaluation.example       # example credentials (committed)
├── .env.evaluation              # actual credentials (never committed)
├── src/
│   ├── index.ts                  # CLI entry point (Commander.js or Minimist)
│   ├── types.ts                  # Test case, result, scoring schema
│   ├── test-cases.ts             # Default hardcoded test cases (~48 country/date pairs)
│   ├── requester.ts              # Workers AI request builder for Base and LoRA
│   ├── scorer.ts                 # Set-diff + tolerance scoring logic
│   ├── reporter.ts               # Console summary + CSV export
│   └── storage/
│       ├── r2-persist.ts         # R2 upload module (workers-sdk or wrangler-compatible)
│       └── csv-export.ts         # CSV generation utility
└── workflows/                    # GitHub Actions
    └── evaluate-weekly.yml       # Scheduled evaluation CI pipeline
```

---

## Environment Variables

### `.env.evaluation` (never commit)

| Variable | Required For | Description |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Base + LoRA requests | Same account as web app |
| `CLOUDFLARE_API_TOKEN` | Base + LoRA requests | Same token, Workers AI permission |
| `R2_BUCKET_NAME` | R2 persistence | Name of R2 bucket for results |
| `R2_ACCESS_KEY_ID` | R2 persistence | Service token (read write) |
| `R2_SECRET_ACCESS_KEY` | R2 persistence | Service token (read write) |

### `.env.evaluation.example` (committed)

All values empty — mirrors structure above.

---

## Notes & Risks

- Workers AI may return different results for the same prompt if model versions change internally. Record model version in each result object to detect drift later.
- Non-determinism from LLM temperature means repeated runs of identical test cases may produce different scores. Fix temperature at 0 and document this constraint.
- If Cloudflare changes their API response format, the `requester.ts` layer should be the only file needing updates — not the scorer or reporter.
