export interface ErrorObject {
  fileName: string;
  error: CodeError;
  description?: string;
}

export interface codeLocation {
  line: number;
  column: number;
}

export class CodeError extends Error {
  loc: codeLocation;
  codeFrame?: string;
}
