# EXORA prompt architecture

Marketing generation uses a provider-neutral `PromptSpecification` in `core/runtime/prompts/`. The builder returns ten ordered layer records with content, required/populated state, source references, validation state and version metadata. `renderPromptSpecification` is the shared textual representation passed to model CLIs. Provider adapters only handle execution details and provider-supported output mechanisms.

## Layer order

1. **Task context** — EXORA role, selected workflow, workspace identity and responsibility.
2. **Tone context** — the selected brand voice and language; a neutral default is used when no voice is configured.
3. **Background context** — relevant records filtered through module read contracts and tenant/tree scoping; source IDs are retained and missing context is explicit.
4. **Task rules** — workflow template, selected module skill guidance, compliance and task boundaries.
5. **Examples** — optional task-specific examples.
6. **Conversation history** — optional, chronological recent messages.
7. **Immediate request** — current user brief and task constraints.
8. **Reasoning guidance** — private analysis is internal; only concise assumptions and decisions may be returned.
9. **Output formatting** — JSON contract and the existing workflow example/write contract.
10. **Response prefill** — optional; omitted by adapters that do not support it.

The draft orchestrator builds and validates the specification before invoking the selected adapter. Both providers run positioning, offer, funnel and growth through the same staged strategy pipeline with its existing validation and resume contract. The month worker reuses the same draft service and preserves its selected provider across stages. Output still goes through envelope parsing, module write constraints, compliance checks and human review.

The workspace draft form accepts up to five explicitly selected uploads from the current node. Text and CSV are read locally. PDF text extraction uses the existing Python environment with pypdf. Claude can read an original PDF if extraction is unavailable. Codex accepts extracted text and native image attachments. A scanned PDF needs readable text or image files for Codex. Conversation history is retrieved by thread, owner and workspace, and only bounded recent messages and short earlier excerpts enter the prompt.

## Provider selection

`provider` is carried from the request into the durable generation job and checked again by the worker. The selected Claude CLI or Codex CLI adapter is the only generation provider executed. Missing CLI authentication fails the selected request. The offline `local_template` option executes without a model. Codex uses ephemeral `codex exec --json` with read-only sandboxing in a fresh temporary directory. The adapter can supply a native schema when the task defines a compatible one. EXORA's open-ended record payload uses local validation and one repair attempt with the same provider. Set `EXORA_CODEX_BIN` to a non-default executable path when needed. Sign in with `codex login` as the operating-system user running the worker.

The workspace admin can set a default provider in Settings; each generation request can still choose its own provider. Credentials are read only by the corresponding CLI and are never stored in template or prompt metadata.

## Adding a workflow

Add a workflow entry to `core/runtime/prompts/prompt-templates.mjs`, map it to the existing module contract, and ensure its `io.yaml` read/write kinds are accurate. Pass only relevant records and examples to `buildPromptSpecification`. Keep structured output constraints in the common specification and provider-specific flags in the adapter. Add a focused test for the new template and its allowed output kinds.

## Observability and privacy

Runs record provider, model when reported, duration, usage where available, template ID/version and per-layer population, sources, version and validation. The admin Prompt Inspector displays metadata for all ten layers. The app persists source references and validation status while omitting prompt bodies. The API checks admin authorization and workspace access before returning inspection metadata.

Claude skill-based rendering continues to use its existing file and script contract, with its task instructions inside the common prompt layers. Codex month jobs use local rendering for optional designs. Chat routing, voice generation and the video edit controls are separate services. The user-facing draft provider controls the generation request.
