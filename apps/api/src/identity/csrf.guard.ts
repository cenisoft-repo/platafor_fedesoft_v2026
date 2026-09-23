import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { hashToken, hashesMatch } from "../common/tokens.js";
import { CSRF_HEADER } from "./cookies.js";
import type { RequestWithSession } from "./session.middleware.js";

const VERBOS_QUE_MUTAN = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Doble control contra CSRF.
 *
 * `SameSite=Lax` cubre la mayoría de los casos, pero no todos los navegadores
 * ni todas las navegaciones, así que va acompañado de un token por sesión: el
 * cliente lo lee de su cookie y lo devuelve en una cabecera. Un sitio de
 * terceros puede provocar que el navegador **envíe** las cookies, pero no
 * puede **leerlas** para reconstruir la cabecera.
 *
 * Sin sesión no hay nada que montar —un webhook servidor a servidor no trae
 * cookies—, así que la comprobación solo aplica a peticiones con sesión.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    if (!VERBOS_QUE_MUTAN.has(req.method)) return true;
    if (!req.session) return true;

    const enviado = req.header(CSRF_HEADER);
    if (!enviado || !hashesMatch(hashToken(enviado), req.session.csrfTokenHash)) {
      throw new ForbiddenException("Falta el token anti-CSRF o no corresponde a la sesión.");
    }
    return true;
  }
}
