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

Tests: `node --test tools/jz-autonomy/test/ tools/jz-gitops/test/`.
