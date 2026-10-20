#!/bin/sh
# Verifica plano-control-2026-10-19.patch SIN tocar el worktree real: trabaja sobre una copia
# desechable (sin red). Fase roja: sólo los hunks de .jz/tests/. Fase verde: el resto.
# Uso (desde la raíz del worktree): .jz/bin/jz-run sh docs/propuestas/verificar-parche.sh
# Limitación: .jz/tests/sandbox.test.mjs y integration.mjs dependen del worktree real y de bwrap;
# no se copian ni se ejecutan aquí. policy.test y recovery.test sólo usan repos temporales propios.
# I-1: el verificador impone conteos exactos RED/GREEN más nombres exactos de 'not ok' en RED,
#   y retorna rc no-cero ante cualquier discrepancia.
# ESTADO: BLOQUEADO — hallazgos C1/C2/I-A/I-B/QA-I1/QA-I3/QA-patch pendientes (ver sección
#   "Revisión C1/C2/I-A/I-B" de PLANO-CONTROL-2026-10-19.md).
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
$G add -A >/dev/null 2>&1
$G commit -qm "base desechable" || { echo "ERROR: commit base"; exit 2; }

# == 0. Comprobación de limpieza del parche (QA-patch: sin --recount) ==
echo "== 0. git apply --check (limpieza; sin --recount) =="
if ! $G apply --check "$PATCH_REL" 2>/dev/null; then
  echo "BLOQUEADO: el parche no aplica limpiamente."
  echo "Hallazgos pendientes que impiden continuar:"
  echo "  QA-patch : hunk offsets incorrectos — regenerar parche con git format-patch limpio"
  echo "  C1/I-A   : jz-run --validate <perfil> ausente; atestación no atómica"
  echo "  I-B      : test.skip vacíos pasan si se activan"
  echo "  C2       : validacion.json acredita binarios en node_modules mutables"
  echo "  QA-I1    : assert_phase no compara nombres exactos de 'not ok' en fase roja"
  echo "  QA-I3    : test I-3 cubre sólo checkUntracked, no tree_fingerprint"
  echo "Resolver según diseño opción-3 en PLANO-CONTROL-2026-10-19.md §Revisión-C1/C2/I-A/I-B."
  exit 1
fi
echo "check: OK"

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

# assert_notok_names NOMBRE SALIDA-TAP LISTA-ESPERADA-SEPARADA-POR-NEWLINE
# Verifica que los nombres exactos de 'not ok' en la salida TAP coincidan con los esperados.
# La LISTA-ESPERADA debe contener una línea por prueba fallida, en cualquier orden.
# Si la lista esperada es la cadena vacía, sólo comprueba que haya al menos un 'not ok'.
assert_notok_names() {
  _phase=$1 _out=$2 _exp_names=$3
  _got_names=$(printf '%s\n' "$_out" | grep '^not ok' | sed 's/^not ok [0-9]* - //' | sort)
  if [ -z "$_exp_names" ]; then
    if [ -z "$_got_names" ]; then
      echo "  ERROR $_phase: no hay 'not ok' (se esperaba al menos uno)"
      return 1
    fi
    echo "  $_phase not ok names: OK (${#_got_names} chars)"
    return 0
  fi
  _sorted_exp=$(printf '%s\n' "$_exp_names" | sort)
  if [ "$_got_names" = "$_sorted_exp" ]; then
    echo "  $_phase not ok names: OK"
    return 0
  else
    echo "  ERROR $_phase: nombres de 'not ok' no coinciden"
    echo "    esperado : $(printf '%s\n' "$_sorted_exp" | tr '\n' '|')"
    echo "    obtenido : $(printf '%s\n' "$_got_names" | tr '\n' '|')"
    return 1
  fi
}

run_tests() {
  ( cd "$W" && node --test --test-reporter=tap .jz/tests/policy.test.mjs .jz/tests/recovery.test.mjs 2>&1 )
}

OVERALL=0

# == Fase 2: ROJA ==
echo "== 2. fase ROJA: sólo .jz/tests/ =="
$G apply --include='.jz/tests/*' "$PATCH_REL" || { echo "ERROR: aplicar hunks de tests"; exit 3; }
OUT_R=$(run_tests)
printf '%s\n' "$OUT_R" | grep -E '^not ok|^# (tests|pass|fail|skipped)'
RES_R=$(count "$OUT_R")
# Conteos esperados en fase roja (QA-I1):
EXP_R="pass=19 fail=7 skipped=3"
assert_phase "rojo" "$RES_R" "$EXP_R" || OVERALL=1
FAIL_R=$(printf '%s\n' "$RES_R" | sed 's/.*fail=\([^ ]*\).*/\1/')
if [ "${FAIL_R:-0}" -eq 0 ] 2>/dev/null; then
  echo "  ERROR rojo: fail=0 indica que las pruebas no detectan código ausente"
  OVERALL=1
fi
# Nombres exactos de 'not ok' en fase roja (QA-I1):
# PENDIENTE: completar esta lista con los nombres reales una vez el parche aplique limpiamente.
# Los 7 tests esperados son (según §Tarea-1 de PLANO-CONTROL):
#   - "las rutas de git … se comprueban como escrituras" (I-1 policy)
#   - "test I-3 de excludesFile global" (I-3 checkUntracked)
#   - 5 pruebas de recovery: sobrecarga, true verde, validacion.json ausente, etiqueta, jz-run vivo
# Dejar vacío aquí fuerza comprobación de presencia solamente (al menos 1 not ok).
EXP_NOTOK_R=""
assert_notok_names "rojo" "$OUT_R" "$EXP_NOTOK_R" || OVERALL=1

# == Fase 3: VERDE ==
echo "== 3. fase VERDE: resto del parche =="
$G apply --exclude='.jz/tests/*' "$PATCH_REL" || { echo "ERROR: aplicar el resto"; exit 3; }
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
# En verde no debe haber ningún 'not ok':
assert_notok_names "verde" "$OUT_G" "" && {
  NOT_G=$(printf '%s\n' "$OUT_G" | grep '^not ok' | wc -l)
  if [ "$NOT_G" -ne 0 ]; then
    echo "  ERROR verde: hay $NOT_G 'not ok' (esperado 0)"
    OVERALL=1
  else
    echo "  verde not ok: 0 (OK)"
  fi
}

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
