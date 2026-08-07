export type GatewayErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_REPLAY'
  | 'BAD_REQUEST'
  | 'CALL_ENDED'
  | 'CALL_FULL'
  | 'CALL_NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'MEDIA_UNAVAILABLE'
  | 'NOT_READY'
  | 'PEER_NOT_FOUND'
  | 'PRODUCER_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TRANSPORT_NOT_FOUND';

export class GatewayError extends Error {
  public constructor(
    public readonly code: GatewayErrorCode,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export function asGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  return new GatewayError('INTERNAL_ERROR', 'Unexpected gateway error', 500);
}
