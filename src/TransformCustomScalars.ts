/* eslint-disable @typescript-eslint/no-explicit-any */
import { FieldTypeDefinition, getSchemaDefinition, TypeDefinition } from './getSchemaDefinition';
import { GraphQLScalarType } from 'graphql/type';
import { getOperationFieldAliasMapping } from './getOperationFieldAliasMapping';

type StringTransformerFunction = (value: string) => any;
type BooleanTransformerFunction = (value: boolean) => any;
type NumberTransformerFunction = (value: number) => any;
export type TransformFunctionType =
  | StringTransformerFunction
  | BooleanTransformerFunction
  | NumberTransformerFunction;

export class TransformCustomScalars {
  private readonly transformDefinitions: Record<string, Pick<GraphQLScalarType, 'parseValue'>>;

  private readonly queries: Map<string, FieldTypeDefinition>;

  private readonly mutations: Map<string, FieldTypeDefinition>;

  private readonly typeDefinitions: Map<string, TypeDefinition>;

  private readonly fieldNameByAliasPath: Map<string, string>;

  constructor(args: {
    schema: string;
    operations: string;
    transformDefinitions: Pick<GraphQLScalarType, 'name' | 'parseValue'>[];
  }) {
    this.transformDefinitions = {};
    for (const transformDefinition of args.transformDefinitions) {
      this.transformDefinitions[transformDefinition.name] = transformDefinition;
    }
    const schemaDefinition = getSchemaDefinition(args.schema);
    this.queries = schemaDefinition.queries;
    this.mutations = schemaDefinition.mutations;
    this.typeDefinitions = schemaDefinition.typeDefinitions;
    this.fieldNameByAliasPath = getOperationFieldAliasMapping(args.operations).fieldNameByAliasPath;
  }

  private getFields(
    obj: any,
    typeDefinition: TypeDefinition,
    type: string,
  ): Map<string, FieldTypeDefinition> {
    const typeName = obj.__typename;
    if (typeDefinition.kind === 'UnionTypeDefinition') {
      if (!typeName) {
        throw new Error('Union type does not have __typename');
      }
      const unionType = typeDefinition.types.find((t) => t === typeName);
      if (!unionType) {
        throw new Error(`Type ${typeName} not found in union ${type}`);
      }
      const unionTypeDef = this.typeDefinitions.get(unionType);
      if (!unionTypeDef || unionTypeDef.kind === 'UnionTypeDefinition') {
        throw new Error(`Type ${typeName} not found in union ${type}`);
      }
      return unionTypeDef.fields;
    }
    if (typeDefinition.kind === 'InterfaceTypeDefinition' && typeName) {
      const interfaceTypeDef = this.typeDefinitions.get(typeName);
      if (!interfaceTypeDef || interfaceTypeDef.kind !== 'ObjectTypeDefinition') {
        throw new Error(`Type ${typeName} not found in interface ${type}`);
      }
      return interfaceTypeDef.fields;
    }
    return typeDefinition.fields;
  }

  private transform(
    result: Record<string, any> | Record<string, any>[] | string | number | boolean | null,
    type: string,
    path: string,
  ): any {
    if (result) {
      if (Array.isArray(result)) {
        return result.map((item) => this.transform(item, type, path));
      }
      const transformDefinition = this.transformDefinitions[type];
      if (transformDefinition) {
        return transformDefinition.parseValue(result);
      }
      if (typeof result === 'object') {
        const fieldDefinitions = this.typeDefinitions.get(type);
        if (!fieldDefinitions) {
          throw new Error(`Type ${type} not found`);
        }
        const fields = this.getFields(result, fieldDefinitions, type);
        for (const [key, value] of Object.entries(result)) {
          if (key.startsWith('__')) {
            // eslint-disable-next-line no-continue
            continue;
          }
          const fieldKeyWithoutAlias = this.fieldNameByAliasPath.get(`${path}.${key}`) ?? key;
          const definition = fields.get(fieldKeyWithoutAlias);
          if (!definition) {
            throw new Error(`Field ${fieldKeyWithoutAlias} not found in type ${type}`);
          }
          result[key] = this.transform(value, definition.name, `${path}.${key}`);
        }
        return result;
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
        (parsedValue as any)[key] = this.transform(value, query.name, key);
      }
    } else {
      for (const [key, value] of Object.entries(parsedValue)) {
        const mutation = this.mutations.get(key);
        if (!mutation) {
          throw new Error(`Mutation ${key} not found`);
        }
        (parsedValue as any)[key] = this.transform(value, mutation.name, key);
      }
    }
    return parsedValue;
  }
}
