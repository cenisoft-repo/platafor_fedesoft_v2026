/**
 * ¿Puede correr la semilla sintética aquí?
 *
 * La semilla crea usuarios con correos y contraseñas públicas y los roles más
 * altos del sistema: en un entorno real sería una puerta de entrada. Por eso no
 * se frena solo con `NODE_ENV=production` (un despliegue que olvide fijarlo, o
 * que lo llame `staging`, la dejaría correr): corre solo si el entorno es de
 * desarrollo o pruebas Y la base es local o de CI. Lo demás se niega.
 *
 * - `NODE_ENV=production` (o `prod…`) se niega siempre, también con el permiso
 *   explícito: producción no tiene excepción.
 * - `ALLOW_SYNTHETIC_SEED=1` autoriza de forma explícita un entorno remoto que
 *   no es producción (una demo, un staging con datos ficticios). Debe ser
 *   exactamente `1`.
 *
 * Es una función pura sobre un objeto de entorno para poder probarla sin base.
 * Nunca devuelve la URL de la base: lleva credenciales. Solo su host.
 */

export interface EntornoSemilla {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  ALLOW_SYNTHETIC_SEED?: string | undefined;
}

export type VeredictoSemilla = { permitida: true } | { permitida: false; motivo: string };

/** `NODE_ENV` vacío cuenta como desarrollo local: así corre `pnpm db:seed` sin configurar nada. */
const ENTORNOS_LOCALES: ReadonlySet<string> = new Set(["", "development", "test"]);

/** `postgres` es el nombre del servicio en `infra/docker/compose.yml`. */
const HOSTS_LOCALES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/** Host de la base, sin credenciales. `undefined` si no se puede leer con certeza. */
export function hostDeLaBase(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") return undefined;
  /* Conexión por socket de Unix (`?host=/var/run/postgresql`): es la máquina local. */
  const porSocket = u.searchParams.get("host");
  if (porSocket?.startsWith("/")) return "localhost";
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "" ? undefined : host;
}

export function evaluarEntornoSemilla(env: EntornoSemilla): VeredictoSemilla {
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();

  if (nodeEnv.startsWith("prod")) {
    return {
      permitida: false,
      motivo: "NODE_ENV=production: la semilla sintética no corre en producción, ni siquiera con ALLOW_SYNTHETIC_SEED.",
    };
  }

  if (env.ALLOW_SYNTHETIC_SEED === "1") return { permitida: true };

  if (!ENTORNOS_LOCALES.has(nodeEnv)) {
    return {
      permitida: false,
      motivo: `NODE_ENV=${nodeEnv}: solo corre con development o test. Para un entorno de pruebas remoto con datos ficticios, fija ALLOW_SYNTHETIC_SEED=1.`,
    };
  }

  const host = hostDeLaBase(env.DATABASE_URL);
  if (host === undefined) {
    return {
      permitida: false,
      motivo:
        "no pude leer el host de DATABASE_URL (falta o no es una URL de PostgreSQL), así que no puedo saber a qué base iría. Defínela, o fija ALLOW_SYNTHETIC_SEED=1 si es una base de pruebas remota.",
    };
  }
  if (!HOSTS_LOCALES.has(host)) {
    return {
      permitida: false,
      motivo: `la base está en ${host}, que no es local ni de CI. Si es una base de pruebas con datos ficticios, fija ALLOW_SYNTHETIC_SEED=1.`,
    };
  }
  return { permitida: true };
}
