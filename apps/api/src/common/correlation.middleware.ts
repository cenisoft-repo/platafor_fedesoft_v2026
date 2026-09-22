import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const CORRELATION_HEADER = "x-correlation-id";

/**
 * Un identificador que viaja de la web al API y de ahí a los jobs. Sin esto,
 * seguir un pago que falló obliga a cruzar registros a ojo.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const entrante = req.header(CORRELATION_HEADER);
    /* No se confía en el valor entrante para nada más que correlacionar, y se
       acota: es una cabecera que cualquiera puede enviar. */
    const id = entrante && /^[\w-]{8,64}$/.test(entrante) ? entrante : randomUUID();
    res.setHeader(CORRELATION_HEADER, id);
    (req as Request & { correlationId?: string }).correlationId = id;
    next();
  }
}
