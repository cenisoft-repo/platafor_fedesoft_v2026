#!/usr/bin/env bash
# Prueba de humo de la imagen del API: lo que un despliegue da por hecho.
#   bash apps/api/docker/smoke.sh <imagen>
# Levanta un PostgreSQL efímero, migra con la imagen y arranca el API con
# NODE_ENV=production. Todo lo que crea lo borra al salir, falle o no.
set -euo pipefail

IMAGEN="${1:?Uso: smoke.sh <imagen>}"
ID="fs-smoke-$$"
RED="$ID-net"
DB_URL="postgresql://fedesoft:smoke_solo_local@$ID-db:5432/fedesoft?schema=public"
PUERTO="${SMOKE_PORT:-3901}"
BASE="http://127.0.0.1:$PUERTO"

limpiar() {
  docker rm -f "$ID-api" "$ID-db" >/dev/null 2>&1 || true
  docker network rm "$RED" >/dev/null 2>&1 || true
}
trap limpiar EXIT

falla() { echo "✗ $*" >&2; docker logs "$ID-api" 2>&1 | tail -20 >&2 || true; exit 1; }
ok() { echo "✓ $*"; }

# Espera hasta que la URL responda el código esperado (máx. ~30 s).
espera_codigo() {
  local ruta="$1" esperado="$2" codigo=""
  for _ in $(seq 1 30); do
    codigo="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$ruta" || true)"
    [ "$codigo" = "$esperado" ] && return 0
    sleep 1
  done
  falla "$ruta respondió $codigo; se esperaba $esperado"
}

docker network create "$RED" >/dev/null
docker run -d --name "$ID-db" --network "$RED" \
  -e POSTGRES_USER=fedesoft -e POSTGRES_PASSWORD=smoke_solo_local -e POSTGRES_DB=fedesoft \
  postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$ID-db" pg_isready -q -U fedesoft -d fedesoft && break; sleep 1; done

# ── Migraciones: aplican desde cero y una segunda pasada no hace nada ──
docker run --rm --network "$RED" -e MIGRATION_DATABASE_URL="$DB_URL" "$IMAGEN" migrate >/dev/null \
  || falla "migrate no aplicó las migraciones"
# Se captura antes de buscar: con pipefail, `grep -q` cortando la tubería
# daría un fallo falso por SIGPIPE.
SEGUNDA="$(docker run --rm --network "$RED" -e MIGRATION_DATABASE_URL="$DB_URL" "$IMAGEN" migrate 2>&1)"
grep -q "No pending migrations" <<<"$SEGUNDA" || falla "migrate no es idempotente"
ok "migraciones: aplican y son idempotentes"

# ── Producción rechaza un secreto de ejemplo ──
ENTORNO=(
  -e DATABASE_URL="$DB_URL"
  -e TRUST_PROXY_HOPS=1
  -e CORS_ORIGINS=https://portal.ejemplo.test
  -e API_PUBLIC_URL=https://api.ejemplo.test
  -e PORTAL_URL=https://portal.ejemplo.test
  -e CONSOLE_URL=https://consola.ejemplo.test
  -e OIDC_ISSUER_URL=https://idp.ejemplo.test/realms/fedesoft
  -e OIDC_CLIENT_ID=portal-api
  -e PAYMENT_WEBHOOK_SECRET="$(openssl rand -hex 32)"
)
if docker run --rm --network "$RED" "${ENTORNO[@]}" -e OIDC_CLIENT_SECRET=cambiar-secreto-local-del-cliente \
  "$IMAGEN" >/dev/null 2>&1; then
  falla "arrancó con un secreto de ejemplo"
fi
ok "producción rechaza secretos de ejemplo"

if docker run --rm --network "$RED" "${ENTORNO[@]}" -e OIDC_CLIENT_SECRET="$(openssl rand -hex 24)" \
  -e MIGRATION_DATABASE_URL="$DB_URL" "$IMAGEN" >/dev/null 2>&1; then
  falla "arrancó con la credencial de migraciones en su entorno"
fi
ok "el API rechaza la credencial de migraciones"

# ── Arranque en producción ──
docker run -d --name "$ID-api" --network "$RED" -p "127.0.0.1:$PUERTO:3000" \
  "${ENTORNO[@]}" -e OIDC_CLIENT_SECRET="$(openssl rand -hex 24)" "$IMAGEN" >/dev/null
espera_codigo /health/live 200
espera_codigo /health/ready 200
ok "sondas: live y ready en 200"

[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/docs")" = 404 ] || falla "/docs expuesto en producción"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/auth/session")" = 401 ] || falla "/v1 sin sesión no da 401"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/v1/users")" = 401 ] || falla "/admin/v1 sin sesión no da 401"
ok "sin sesión: 401; sin documentación pública"

docker logs "$ID-api" 2>&1 | tail -1 | grep -q '^{"level"' || falla "los logs de producción no son JSON"
ok "logs en JSON"

[ "$(docker exec "$ID-api" id -u)" != 0 ] || falla "el proceso corre como root"
docker exec "$ID-api" sh -c 'touch /app/x' 2>/dev/null && falla "el código de la imagen es escribible"
docker exec "$ID-api" sh -c 'command -v npm || command -v corepack || command -v yarn' >/dev/null \
  && falla "quedan gestores de paquetes en la imagen"
ok "sin root, código de solo lectura y sin gestores de paquetes"

# ── Sin base, la réplica deja de recibir tráfico; con base, vuelve ──
docker stop -t 5 "$ID-db" >/dev/null
espera_codigo /health/ready 503
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health/live")" = 200 ] || falla "live cayó con la base"
docker start "$ID-db" >/dev/null
espera_codigo /health/ready 200
ok "ready: 503 sin base y se recupera sola"

# ── Cierre ordenado ──
docker stop -t 20 "$ID-api" >/dev/null
[ "$(docker inspect --format '{{.State.ExitCode}}' "$ID-api")" = 0 ] || falla "no cerró de forma ordenada con SIGTERM"
ok "SIGTERM: cierre ordenado"
