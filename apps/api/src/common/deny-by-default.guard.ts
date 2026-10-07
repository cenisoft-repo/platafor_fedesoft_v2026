import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { AUTHENTICATED_KEY, PERMISSION_KEY, PUBLIC_KEY, grants, isConsoleController } from "./permissions.js";

export interface ActorContext {
  userId: string;
  organizationId: string | null;
  permissions: string[];
  internal: boolean;
  /** Sesión de servidor que originó el actor. Nulo para actores de sistema. */
  sessionId?: string | null;
}

/**
 * Denegar por defecto.
 *
 * Un endpoint sin `@RequirePermission`, `@Authenticated` ni `@Public` no se
 * sirve: el olvido falla cerrado, no abierto. Es la traducción literal de la
 * regla del proyecto — la autorización vive en el servidor, y ocultar un
 * botón en el frontend no es un control.
 *
 * El actor lo pone `SessionMiddleware` a partir de la cookie de sesión. Los
 * controladores de la consola solo aceptan actores internos, y los del portal
 * solo externos. La superficie sale del controlador resuelto, no de la URL.
 */
@Injectable()
export class DenyByDefaultGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const objetivos = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, objetivos)) return true;

    const requerido = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, objetivos);
    const soloSesion = this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, objetivos);
    if (!requerido && !soloSesion) {
      throw new ForbiddenException(
        "Endpoint sin permiso declarado. Añade @RequirePermission, @Authenticated o @Public de forma explícita.",
      );
    }

    const actor = context.switchToHttp().getRequest<{ actor?: ActorContext }>().actor;
    /* 401 y no 403: el cliente necesita distinguir "inicia sesión" de "no
       tienes permiso" para llevar al usuario al lugar correcto. */
    if (!actor) throw new UnauthorizedException("Sin sesión.");

    const consola = isConsoleController(Reflect.getMetadata(PATH_METADATA, context.getClass()));
    if (consola !== actor.internal) {
      throw new ForbiddenException("Esta sesión no es válida para esta superficie.");
    }

    if (requerido && !grants(actor.permissions, requerido)) {
      throw new ForbiddenException("Permiso insuficiente.");
    }
    return true;
  }
}
