/**
 * Puerto de facturación electrónica DIAN.
 *
 * Siigo, Alegra o un proveedor propio: el dominio solo pide que se emita una
 * factura y espera un CUFE. Lo que se persiste es la respuesta cruda, para
 * poder auditar y reconciliar sin depender del formato de nadie.
 */

export interface InvoiceLine {
  concept: string;
  amount: string;
  quantity: number;
}

export interface IssueInvoiceRequest {
  /** Idempotencia también aquí: reintentar no debe emitir dos facturas. */
  idempotencyKey: string;
  organization: {
    nit: string;
    nitDv: string;
    legalName: string;
    city: string | null;
  };
  lines: InvoiceLine[];
  total: string;
  currency: string;
  paymentReference: string;
}

export type IssueInvoiceResult =
  | {
      status: "EMITIDA";
      /** Código Único de Factura Electrónica devuelto por la DIAN. */
      cufe: string;
      number: string;
      issuedAt: Date;
      raw: unknown;
    }
  | {
      status: "RECHAZADA";
      /** Motivo tal como lo da la DIAN: se conserva literal para el reclamo. */
      reason: string;
      raw: unknown;
    };

export interface ElectronicInvoicerPort {
  readonly name: string;
  issue(request: IssueInvoiceRequest): Promise<IssueInvoiceResult>;
}

export const ELECTRONIC_INVOICER = Symbol("ELECTRONIC_INVOICER");
