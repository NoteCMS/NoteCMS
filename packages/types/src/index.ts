export type Role = 'owner' | 'editor' | 'viewer';

export type FieldDefinition = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select' | 'repeater' | 'image' | 'entries';
  required?: boolean;
  config?: Record<string, unknown>;
};
