import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY, PUBLIC_KEY, grants } from "./permissions.js";

export interface ActorContext {
  userId: string;
  organizationId: string | null;
  permissions: string[];
  internal: boolean;
}

/**
 * Denegar por defecto.
 *
 * Un endpoint sin `@RequirePermission` y sin `@Public` no se sirve: el olvido
 * falla cerrado, no abierto. Es la traducción literal de la regla del
 * proyecto — la autorización vive en el servidor, y ocultar un botón en el
 * frontend no es un control.
 */
@Injectable()
export class DenyByDefaultGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const objetivos = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, objetivos)) return true;

    const requerido = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, objetivos);
    if (!requerido) {
      throw new ForbiddenException(
        "Endpoint sin permiso declarado. Añade @RequirePermission o @Public de forma explícita.",
      );
    }

    const request = context.switchToHttp().getRequest<{ actor?: ActorContext }>();
    const actor = request.actor;
    if (!actor) throw new ForbiddenException("Sin sesión.");

    if (!grants(actor.permissions, requerido)) {
      throw new ForbiddenException("Permiso insuficiente.");
    }
    return true;
  }
}
