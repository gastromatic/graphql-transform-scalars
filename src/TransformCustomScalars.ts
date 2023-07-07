import { FieldTypeDefinition, getSchemaDefinition } from './getSchemaDefinition';

type StringTransformerFunction = (value: string) => any;
type BooleanTransformerFunction = (value: boolean) => any;
type NumberTransformerFunction = (value: number) => any;
export type TransformFunctionType =
  | StringTransformerFunction
  | BooleanTransformerFunction
  | NumberTransformerFunction;

export class TransformCustomScalars {
  private readonly transformDefinitions: Record<string, TransformFunctionType>;

  private readonly queries: Map<string, FieldTypeDefinition>;

  private readonly mutations: Map<string, FieldTypeDefinition>;

  private readonly objects: Map<string, Map<string, FieldTypeDefinition>>;

  constructor(schema: string, transformDefinitions: Record<string, TransformFunctionType>) {
    this.transformDefinitions = transformDefinitions;
    const schemaDefinition = getSchemaDefinition(schema);
    this.objects = schemaDefinition.objects;
    this.queries = schemaDefinition.queries;
    this.mutations = schemaDefinition.mutations;
  }

  private transform(
    result: Record<string, any> | Record<string, any>[] | string | number | boolean | null,
    type: string,
  ): any {
    if (result) {
      if (Array.isArray(result)) {
        return result.map((item) => this.transform(item, type));
      }
      if (typeof result === 'object') {
        const fieldDefinitions = this.objects.get(type);
        if (!fieldDefinitions) {
          return result;
        }
        for (const [key, value] of Object.entries(result)) {
          const definition = fieldDefinitions.get(key);
          if (definition) {
            result[key] = this.transform(value, definition.name);
          }
        }
        return result;
      }
      const transformDefinition = this.transformDefinitions[type];
      if (transformDefinition) {
        return (transformDefinition as (value: string | number | boolean) => any)(result);
      }
    }
    return result;
  }

  addCustomScalars<T>(parsedValue: T, operationType: 'query' | 'mutation'): T {
    if (!parsedValue) {
      return parsedValue;
    }
    if (typeof parsedValue !== 'object') {
      throw new Error('Parsed value must be an object');
    }
    if (operationType === 'query') {
      for (const [key, value] of Object.entries(parsedValue)) {
        const query = this.queries.get(key);
        if (!query) {
          throw new Error(`Query ${key} not found`);
        }
        (parsedValue as any)[key] = this.transform(value, query.name);
      }
    } else {
      for (const [key, value] of Object.entries(parsedValue)) {
        const mutation = this.mutations.get(key);
        if (!mutation) {
          throw new Error(`Mutation ${key} not found`);
        }
        (parsedValue as any)[key] = this.transform(value, mutation.name);
      }
    }
    return parsedValue;
  }
}
