export type CatalogDiagnosticContext = {
  module?: string;
  package?: string;
  path?: string;
  dependency?: string;
  hint?: string;
};

export class CatalogDiagnostic extends Error {
  readonly code: string;
  readonly context: CatalogDiagnosticContext;

  constructor(
    code: string,
    message: string,
    context: CatalogDiagnosticContext = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CatalogDiagnostic";
    this.code = code;
    this.context = context;
  }
}
