/** Thrown when entry `data` JSON fails `validateEntryData`; resolvers map this to GraphQL `extensions.fieldPath`. */
export class EntryFieldValidationError extends Error {
  readonly fieldPath: string[];

  constructor(message: string, fieldPath: string[]) {
    super(message);
    this.name = 'EntryFieldValidationError';
    this.fieldPath = fieldPath;
  }
}
