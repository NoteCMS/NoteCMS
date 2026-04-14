export type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select' | 'repeater' | 'image';

export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  config?: Record<string, unknown>;
};
