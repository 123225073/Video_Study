# 风沙AI学习平台 3.4.0 · Design QA

## Visual target

- Reference: the six AI好记 desktop screenshots supplied by the product owner on 2026-08-31.
- Target characteristics: quiet light canvas, compact left navigation, fast-create home, three-column learning workspace, central media plus timeline transcript, persistent notes at right, low visual noise.
- Intentional differentiation: warm paper white, ink black and amber brand palette; local-first/BYOK language; no membership, growth, referral or shared-knowledge-base clutter.

## Compared states

| State | Viewport | Evidence | Result |
| --- | ---: | --- | --- |
| Create/import home | 900 × 700 | `output/e2e-learning-studio/00-home-900.png` | Passed: no clipping or horizontal overflow; real and reserved actions are visually distinct. |
| Learning library | 1200 × 800 | `output/e2e-learning-studio/01-learning-center.png` | Passed: search, filters and list/card switch share one clear hierarchy. |
| Three-column study | 1800 × 1000 | `output/e2e-learning-studio/04-note-scene.png` | Passed: resizable AI workspace, media/transcript and one continuous notebook remain visible together; both side panels can be collapsed and restored. |
| Interactive mind map | 1800 × 1000 | `output/e2e-learning-studio/04b-mindmap.png` | Passed: central topic, colored branches, deeper-level collapse/expand, zoom and timestamp evidence stay inside the AI workspace. |
| AI image studio | 1800 × 1000 | `output/e2e-learning-studio/05-output-scene.png` | Passed: one brief, purpose/style/ratio choices, optional advanced optimization and generated-image viewer replace the former stacked image modes. |
| Compact study | 900 × 700 | `output/e2e-learning-studio/09-output-scene-compact.png` | Passed: scene switch replaces the wide layout without horizontal overflow. |

## Senior visual review

- Typography: large editorial headings are limited to home/library; working screens use compact information typography.
- Spacing: all primary panels use consistent 12–16 px internal rhythm and aligned rounded boundaries.
- Color: amber is reserved for the active state, time evidence and primary action; black is used for strong selection, not as decoration.
- Density: module choices stay in a fixed 3 × 3 grid; detailed controls appear only inside the selected module.
- Accessibility: keyboard focus is visible, scene tabs support arrow navigation, icon-only actions have labels, and disabled integrations state their boundary.
- Responsive behavior: the 1800 px state matches the reference relationship; 900 px uses explicit task scenes rather than squeezed columns.

## Functional visual checks

- One continuous Markdown notebook accepts free writing and timestamped transcript excerpts; the E2E leaves immediately, reopens the lesson and verifies the newest draft is restored.
- All nine AI module entry points are reachable in the three-column workspace.
- The image studio exposes purpose, style, ratio and one visible brief; prompt optimization stays collapsed until requested, and the viewer supports zoom and drag.
- Transcript selection is word-range accurate; its toolbar is draggable, dismisses on blank-space clicks and appends evidence directly to the notebook.
- Compact and wide layouts keep the active task reachable without horizontal overflow.

Streaming AI transport, image partial/final state, cancellation/replacement, Mermaid validation,
learning-workspace persistence, Obsidian conflict handling and local API isolation are release-gate
tests rather than visual-screenshot claims. They are covered by the dedicated automated suites listed in
the project README and Windows CI workflow.

final result: passed
