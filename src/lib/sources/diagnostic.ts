export type DiagnosticContext = {
  module?: string;
  path?: string;
  hint?: string;
};

export class SyncDiagnostic extends Error {
  readonly code: string;
  readonly context: DiagnosticContext;

  constructor(
    code: string,
    message: string,
    context: DiagnosticContext = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SyncDiagnostic";
    this.code = code;
    this.context = context;
  }
}

export function toSyncDiagnostic(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): SyncDiagnostic {
  if (error instanceof SyncDiagnostic) {
    return error;
  }
  return new SyncDiagnostic(fallbackCode, fallbackMessage, {}, { cause: error });
}
