# jz-autonomy

Supervisor de JZ-AI V2: ejecuta objetivos `jz-autonomy-objective-v1` con workers de Claude Code u OpenCode,
corrige automáticamente, confirma y publica mediante `tools/jz-gitops/jz-git.mjs` y se reanuda sin repetir
pasos. Operación, responsabilidades y límites: [`docs/OPERACION-JZ-AI.md`](../../docs/OPERACION-JZ-AI.md).

```sh
git -C <worktree> show <sha>:tools/jz-autonomy/bin/jz-install | bash -s -- <worktree> <sha>
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-autonomy.js run --root <worktree> \
  --objective tools/jz-autonomy/objectives/handoff-contract.json --state-dir <nombre> [--engines claude,opencode]
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-autonomy.js resume --root <worktree> --state-dir <nombre>
```

`jz-coord` (misma release) coordina a Claude Code y OpenCode como orquestadores pares de una meta
`jz-coord-goal-v1`: liderazgo, delegación con resultados estructurados, lease de escritor, checkpoints
verificables y transferencia automática ante cuota o caída. Ver la sección «Orquestadores pares» de
[`docs/OPERACION-JZ-AI.md`](../../docs/OPERACION-JZ-AI.md).

```sh
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-coord.js lead --root <worktree> --goal <meta.json> --state-dir <nombre>
node tools/jz-autonomy/demo/interop-demo.mjs --source <worktree> --mode synthetic   # o --mode real
```

Tests: `node --test tools/jz-autonomy/test/*.test.js tools/jz-gitops/test/*.mjs`.
