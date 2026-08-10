export type ToolchainDiagnosticContext = {
  path?: string;
  hint?: string;
};

export class ToolchainDiagnostic extends Error {
  readonly code: string;
  readonly context: ToolchainDiagnosticContext;

  constructor(
    code: string,
    message: string,
    context: ToolchainDiagnosticContext = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ToolchainDiagnostic";
    this.code = code;
    this.context = context;
  }
}
