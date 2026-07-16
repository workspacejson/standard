import Ajv2020 from 'ajv/dist/2020.js';

export function compileSchemaValidator<T>(schema: object): (data: unknown) => data is T {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  return ajv.compile<T>(schema);
}
