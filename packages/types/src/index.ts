export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export type FieldDefinition = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select' | 'repeater' | 'image';
  required?: boolean;
  config?: Record<string, unknown>;
};
