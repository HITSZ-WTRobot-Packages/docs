export type DoxygenDiagnosticContext = {
  module?: string;
  package?: string;
  path?: string;
  expectedVersion?: string;
  actualVersion?: string;
  hint?: string;
};

export class DoxygenDiagnostic extends Error {
  readonly code: string;
  readonly context: DoxygenDiagnosticContext;

  constructor(
    code: string,
    message: string,
    context: DoxygenDiagnosticContext = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DoxygenDiagnostic";
    this.code = code;
    this.context = context;
  }
}
