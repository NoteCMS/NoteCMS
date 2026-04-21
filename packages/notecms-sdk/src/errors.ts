import type { GraphQLErrorPayload } from './request.js';

export class NoteCmsError extends Error {
  readonly status: number;

  readonly errors: GraphQLErrorPayload[];

  constructor(
    message: string,
    options: {
      status: number;
      errors?: GraphQLErrorPayload[];
    },
  ) {
    super(message);
    this.name = 'NoteCmsError';
    this.status = options.status;
    this.errors = options.errors ?? [];
  }
}
