export type FieldType =
  | 'text'
  | 'textarea'
  | 'wysiwyg'
  | 'url'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'repeater'
  | 'image'
  | 'entries';

export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  config?: Record<string, unknown>;
};
