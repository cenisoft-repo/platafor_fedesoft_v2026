import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  ElectronicInvoicerPort,
  IssueInvoiceRequest,
  IssueInvoiceResult,
} from "../ports/electronic-invoicer.port.js";

/**
 * Facturador de pruebas.
 *
 * Genera un CUFE sintético con la forma del real —40 hex— y es determinista
 * respecto a la clave de idempotencia: reintentar la misma emisión devuelve
 * el mismo CUFE, que es justo el comportamiento que el dominio debe tolerar.
 *
 * NO calcula el CUFE como lo exige la DIAN (que lo deriva de NIT, valores,
 * impuestos, clave técnica y fecha, con SHA-384). Eso vive en el adaptador
 * real, contra el proveedor que Fedesoft elija.
 */
@Injectable()
export class SandboxInvoicer implements ElectronicInvoicerPort {
  readonly name = "sandbox";

  private consecutivo = 0;
  private readonly emitidas = new Map<string, IssueInvoiceResult>();

  async issue(request: IssueInvoiceRequest): Promise<IssueInvoiceResult> {
    const previa = this.emitidas.get(request.idempotencyKey);
    if (previa) return Promise.resolve(previa);

    /* Un NIT vacío o un total en cero son rechazos reales de la DIAN, y el
       dominio tiene que saber manejar el camino de rechazo, no solo el feliz. */
    if (!request.organization.nit || Number(request.total) <= 0) {
      const rechazo: IssueInvoiceResult = {
        status: "RECHAZADA",
        reason: "Documento incompleto: NIT del adquiriente o total inválido.",
        raw: { sandbox: true, request: request.idempotencyKey },
      };
      this.emitidas.set(request.idempotencyKey, rechazo);
      return Promise.resolve(rechazo);
    }

    this.consecutivo += 1;
    const cufe = createHash("sha256")
      .update(request.idempotencyKey)
      .update(request.organization.nit)
      .update(request.total)
      .digest("hex")
      .slice(0, 40);

    const resultado: IssueInvoiceResult = {
      status: "EMITIDA",
      cufe,
      number: `FES-${String(9000 + this.consecutivo)}`,
      issuedAt: new Date(),
      raw: { sandbox: true, ubl: "2.1", validated: true },
    };
    this.emitidas.set(request.idempotencyKey, resultado);
    return Promise.resolve(resultado);
  }
}
