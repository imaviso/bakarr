export interface RouteErrorResponse {
  readonly headers?: Record<string, string>;
  readonly message: string;
  readonly status: number;
}
