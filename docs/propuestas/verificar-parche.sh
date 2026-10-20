#!/bin/sh
# Verifica plano-control-2026-10-19.patch SIN tocar el worktree real: trabaja sobre una copia
# desechable (sin red). Fase roja: sólo los hunks de .jz/tests/. Fase verde: el resto.
# Uso (desde la raíz del worktree): .jz/bin/jz-run sh docs/propuestas/verificar-parche.sh
# Limitación: .jz/tests/sandbox.test.mjs y integration.mjs dependen del worktree real y de bwrap;
# no se copian ni se ejecutan aquí. policy.test y recovery.test sólo usan repos temporales propios.
# I-1: el verificador impone conteos exactos RED/GREEN y retorna rc no-cero ante cualquier discrepancia.
set -u

SRC=$(pwd)
PATCH_REL=docs/propuestas/plano-control-2026-10-19.patch
[ -f "$SRC/$PATCH_REL" ] || { echo "ERROR: ejecuta desde la raíz del worktree ($PATCH_REL no existe)"; exit 2; }

TMP=$(mktemp -d) || exit 2
trap 'rm -rf "$TMP"' EXIT INT TERM
W="$TMP/w"
mkdir -p "$W/docs/propuestas" "$W/.opencode"

# Sólo lo necesario para aplicar el parche y ejecutar los tests de .jz/tests.
cp -Rp "$SRC/.jz" "$W/.jz"
rm -rf "$W/.jz/tests/sandbox.test.mjs" "$W/.jz/tests/integration.mjs"
cp -Rp "$SRC/.claude" "$W/.claude"
cp -Rp "$SRC/.opencode/plugins" "$SRC/.opencode/agents" "$W/.opencode/"
for f in AGENTS.md CLAUDE.md .gitignore docs/AUTONOMIA-JZ.md; do
  [ -f "$SRC/$f" ] && cp -p "$SRC/$f" "$W/$f"
done
cp -p "$SRC/$PATCH_REL" "$W/$PATCH_REL"

G="git -C $W -c user.name=jz-verif -c user.email=jz-verif@example.invalid"
$G init -q -b main || exit 2
# El parche se aplica sobre copias; el sandbox de pruebas del original no se copia.
$G add -A >/dev/null 2>&1
$G commit -qm "base desechable" || { echo "ERROR: commit base"; exit 2; }
# El .gitignore real puede ignorar rutas; nada del parche debe quedar fuera del repo base.

PATCH="$W/$PATCH_REL"
echo "== 1. git apply --check -v =="
RECOUNT=""
if $G apply --check -v "$PATCH_REL"; then
  echo "check: OK"
else
  echo "check: FALLÓ; reintento con --recount"
  if $G apply --check --recount -v "$PATCH_REL"; then
    echo "check --recount: OK"; RECOUNT="--recount"
  else
    echo "check --recount: FALLÓ (el parche no aplica; no se corrige aquí)"
    exit 3
  fi
fi

# count <salida-tap> — extrae pass/fail/skipped del resumen TAP
count() {
  p=$(printf '%s\n' "$1" | awk '/^# pass /{print $3}')
  f=$(printf '%s\n' "$1" | awk '/^# fail /{print $3}')
  s=$(printf '%s\n' "$1" | awk '/^# skipped /{print $3}')
  printf 'pass=%s fail=%s skipped=%s' "${p:-?}" "${f:-?}" "${s:-?}"
}

# assert_phase NOMBRE OBTENIDO ESPERADO — rc=0 si coinciden, rc=1 si no
assert_phase() {
  _name=$1 _got=$2 _exp=$3
  if [ "$_got" = "$_exp" ]; then
    echo "  conteos $1: OK ($2)"
    return 0
  else
    echo "  ERROR $1: esperado=[$3] obtenido=[$2]"
    return 1
  fi
}

run_tests() {
  ( cd "$W" && node --test --test-reporter=tap .jz/tests/policy.test.mjs .jz/tests/recovery.test.mjs 2>&1 )
}

OVERALL=0

# == Fase 2: ROJA ==
echo "== 2. fase ROJA: sólo .jz/tests/ =="
$G apply $RECOUNT --include='.jz/tests/*' "$PATCH_REL" || { echo "ERROR: aplicar hunks de tests"; exit 3; }
OUT_R=$(run_tests)
printf '%s\n' "$OUT_R" | grep -E '^not ok|^# (tests|pass|fail|skipped)'
RES_R=$(count "$OUT_R")
# En fase roja deben fallar exactamente 7 pruebas (I-1/I-2/I-3 sin código):
EXP_R="pass=19 fail=7 skipped=3"
assert_phase "rojo" "$RES_R" "$EXP_R" || OVERALL=1
FAIL_R=$(printf '%s\n' "$RES_R" | sed 's/.*fail=\([^ ]*\).*/\1/')
if [ "${FAIL_R:-0}" -eq 0 ] 2>/dev/null; then
  echo "  ERROR rojo: fail=0 indica que las pruebas no detectan código ausente (parche ya aplicado o sin cobertura)"
  OVERALL=1
fi

# == Fase 3: VERDE ==
echo "== 3. fase VERDE: resto del parche =="
$G apply $RECOUNT --exclude='.jz/tests/*' "$PATCH_REL" || { echo "ERROR: aplicar el resto"; exit 3; }
OUT_G=$(run_tests)
printf '%s\n' "$OUT_G" | grep -E '^not ok|^# (tests|pass|fail|skipped)'
RES_G=$(count "$OUT_G")
EXP_G="pass=26 fail=0 skipped=3"
assert_phase "verde" "$RES_G" "$EXP_G" || OVERALL=1
FAIL_G=$(printf '%s\n' "$RES_G" | sed 's/.*fail=\([^ ]*\).*/\1/')
if [ "${FAIL_G:-1}" -ne 0 ] 2>/dev/null; then
  echo "  ERROR verde: fail>0 tras parche completo"
  OVERALL=1
fi

# == Auto-prueba del verificador (I-1): demuestra que una discrepancia retorna rc no-cero ==
echo "== 4. auto-prueba del verificador =="
if assert_phase "auto-prueba" "pass=99 fail=0 skipped=0" "pass=19 fail=7 skipped=3" 2>/dev/null; then
  echo "  ERROR: assert_phase no detectó la discrepancia (el verificador está roto)"
  OVERALL=1
else
  echo "  auto-prueba: OK — discrepancia detectada, assert_phase retorna rc no-cero"
fi

echo
echo "== RESUMEN =="
echo "rojo : $RES_R   (esperado: $EXP_R)"
echo "verde: $RES_G   (esperado: $EXP_G)"
if [ "$OVERALL" -eq 0 ]; then
  echo "RESULTADO: OK"
else
  echo "RESULTADO: FALLIDO"
fi
exit "$OVERALL"
