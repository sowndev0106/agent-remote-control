export interface ErrorBody {
  code: string;
  operation: string;
  message: string;
  detail?: string;
  recoveryAction?: string;
}

export interface OkEnvelope<T> {
  ok: true;
  data: T;
  error: null;
}

export interface ErrEnvelope {
  ok: false;
  data: null;
  error: ErrorBody;
}

export type Envelope<T> = OkEnvelope<T> | ErrEnvelope;

export class AppError extends Error {
  readonly code: string;
  readonly operation: string;
  readonly detail?: string;
  readonly recoveryAction?: string;
  readonly httpStatus: number;

  constructor(body: ErrorBody & { httpStatus?: number }) {
    super(body.message);
    this.name = "AppError";
    this.code = body.code;
    this.operation = body.operation;
    if (body.detail !== undefined) this.detail = body.detail;
    if (body.recoveryAction !== undefined) this.recoveryAction = body.recoveryAction;
    this.httpStatus = body.httpStatus ?? 400;
  }

  toBody(): ErrorBody {
    const out: ErrorBody = {
      code: this.code,
      operation: this.operation,
      message: this.message,
    };
    if (this.detail !== undefined) out.detail = this.detail;
    if (this.recoveryAction !== undefined) out.recoveryAction = this.recoveryAction;
    return out;
  }
}

export function okEnvelope<T>(data: T): OkEnvelope<T> {
  return { ok: true, data, error: null };
}

export function errEnvelope(e: AppError | Error): ErrEnvelope {
  const body: ErrorBody =
    e instanceof AppError
      ? e.toBody()
      : {
          code: "internal_error",
          operation: "unknown",
          message: e.message,
        };
  return { ok: false, data: null, error: body };
}
