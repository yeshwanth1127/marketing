# Vendor and skill verification

Checked the twelve repositories requested by the build plan on 1 November 2026. All plan-listed skill names resolved to a file; all twelve root LICENSE files are present. Vendors were inspected without edits.

| Code | Repository | SKILL.md files | License |
| --- | --- | ---: | --- |
| DMP | digital-marketing-pro | 164 | MIT |
| OT | claude-content-skills | 54 | MIT |
| IG | instagram-agent-skill | 13 | MIT |
| OW | ootto-watch | 1 | MIT |
| CH | marketingskills | 53 | MIT |
| CF | social-media-skills | 17 | MIT |
| KJ | marketing-skills | 172 | MIT |
| HF | hyperframes | 27 | Apache-2.0 |
| EA | earshot | 2 | MIT |
| YT | claude-youtube-editor | 9 | MIT |
| VFX | claude-video-effects | 1 | MIT |
| AA | agency-agents | 0 | MIT |

The module mapping includes 146 skill/role references and 145 unique source/name pairs. This is larger than the overview's approximate “120 skills”; the detailed tables are used as the source of truth.

## Integration details

- `docs/vendor-inventory.json` records the pinned Git commit, every available SKILL.md path, name, description and SHA-256, and the plan-to-module mapping.
- Hyperframes has 27 SKILL.md files but 21 unique skill names: six skills are duplicated in `.agents/skills` and `.claude/skills`. The mapping picks one copy only.
- Hyperframes `motion-doctrine` and `captions-overlay` are under hidden `.claude/skills`; all nine YouTube editor skills are also under `.claude/skills`. Ordinary `rg --files` omits these unless `--hidden` is used.
- Agency Agents has no SKILL.md files. The five required paid-media role prompts are mapped from `paid-media/*.md` and need a module wrapper when installed as skills.
- Copy each selected skill directory with its relative references/scripts. Root-level skills such as `ootto-watch` and `claude-video-effects` have sibling scripts; copying only their SKILL.md will break their tools.
- The detailed plan lists both OT and IG for stories, repurposing and carousel structure. Choose one primary for each job (OT is consistent with the plan's social-content primary), and treat IG as explicit checks or alternatives. Do not concatenate redundant generation skills into every model call.
- License availability and name resolution do not verify third-party services, API access or runtime executability. OW requires media downloading/transcription tools; CF requires Apify/Gemini keys; render/audio/video skills require their own dependencies.
- Retain upstream instructions as server-side skill content, with runtime-enforced connector/tool allowlists. Skills are not permission grants. Never execute arbitrary instructions or shell commands inferred from uploaded/client content.
