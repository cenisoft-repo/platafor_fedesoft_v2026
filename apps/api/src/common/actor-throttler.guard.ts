import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { ActorContext } from "./deny-by-default.guard.js";

/**
 * Límite de peticiones global (hallazgo A5 A1).
 *
 * Con sesión, el límite es por usuario: una oficina entera detrás de la misma
 * IP no se bloquea entre sí, y un usuario no lo elude cambiando de IP. Sin
 * sesión, por IP; esa IP es real solo si `TRUST_PROXY_HOPS` coincide con los
 * saltos del balanceador (ver `main.ts`).
 *
 * Almacenamiento en memoria: válido con una réplica. Con varias, pasa a Redis
 * (deuda registrada en ADR-008).
 */
@Injectable()
export class ActorThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const actor = req.actor as ActorContext | undefined;
    if (actor) return `u:${actor.userId}`;
    return `ip:${String(req.ip ?? "desconocida")}`;
  }
}
