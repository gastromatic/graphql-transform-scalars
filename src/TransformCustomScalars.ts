import { GraphQLScalarType } from 'graphql';
import { FieldTypeDefinition, getSchemaDefinition, TypeDefinition } from './getSchemaDefinition';
import { getOperationFieldAliasMapping } from './getOperationFieldAliasMapping';

type StringTransformerFunction = (value: string) => any;
type BooleanTransformerFunction = (value: boolean) => any;
type NumberTransformerFunction = (value: number) => any;
export type TransformFunctionType =
  | StringTransformerFunction
  | BooleanTransformerFunction
  | NumberTransformerFunction;
type AliasMapping = Map<string, string>;
type LoggerFunction = (args: { message: string; level: 'info' | 'warn' | 'error' }) => void;

export class TransformCustomScalars {
  private readonly transformDefinitions: Record<string, Pick<GraphQLScalarType, 'parseValue'>>;

  private readonly queries: Map<string, FieldTypeDefinition>;

  private readonly mutations: Map<string, FieldTypeDefinition>;

  private readonly typeDefinitions: Map<string, TypeDefinition>;

  private readonly fieldNameByAliasPath: AliasMapping;

  private readonly fieldNameByAliasPathByOperation: Map<string, AliasMapping>;

  private readonly logger?: LoggerFunction;

  constructor(args: {
    schema: string;
    operations: string;
    transformDefinitions: Pick<GraphQLScalarType, 'name' | 'parseValue'>[];
    logger?: LoggerFunction;
    __skipOperations?: boolean;
  }) {
    this.logger = args.logger;
    this.logger?.({ message: 'Initializing TransformCustomScalars', level: 'info' });

    this.transformDefinitions = {};
    for (const transformDefinition of args.transformDefinitions) {
      this.transformDefinitions[transformDefinition.name] = transformDefinition;
    }
    this.logger?.({
      message: `Registered ${args.transformDefinitions.length} transform definitions: ${args.transformDefinitions.map((t) => t.name).join(', ')}`,
      level: 'info',
    });

    const schemaDefinition = getSchemaDefinition(args.schema);
    this.queries = schemaDefinition.queries;
    this.mutations = schemaDefinition.mutations;
    this.typeDefinitions = schemaDefinition.typeDefinitions;
    this.logger?.({
      message: `Loaded schema with ${this.queries.size} queries (${Array.from(this.queries.keys()).join(', ')}), ${this.mutations.size} mutations (${Array.from(this.mutations.keys()).join(', ')}), and ${this.typeDefinitions.size} type definitions`,
      level: 'info',
    });

    if (args.__skipOperations) {
      this.fieldNameByAliasPath = new Map();
      this.fieldNameByAliasPathByOperation = new Map();
    } else {
      const aliasMapping = getOperationFieldAliasMapping(args.operations);
      this.fieldNameByAliasPath = aliasMapping.fieldNameByAliasPath;
      this.fieldNameByAliasPathByOperation = aliasMapping.fieldNameByAliasPathByOperation;
      this.logger?.({
        message: `Mapped ${this.fieldNameByAliasPath.size} field aliases from operations`,
        level: 'info',
      });
    }
  }

  private getFields(
    obj: any,
    typeDefinition: TypeDefinition,
    type: string,
  ): Map<string, FieldTypeDefinition> {
    const typeName = obj.__typename;
    if (typeDefinition.kind === 'UnionTypeDefinition') {
      this.logger?.({
        message: `Resolving union type ${type} with __typename: ${typeName}`,
        level: 'info',
      });
      if (!typeName) {
        this.logger?.({ message: 'Union type does not have __typename', level: 'error' });
        throw new Error('Union type does not have __typename');
      }
      const unionType = typeDefinition.types.find((t) => t === typeName);
      if (!unionType) {
        this.logger?.({ message: `Type ${typeName} not found in union ${type}`, level: 'error' });
        throw new Error(`Type ${typeName} not found in union ${type}`);
      }
      const unionTypeDef = this.typeDefinitions.get(unionType);
      if (!unionTypeDef || unionTypeDef.kind === 'UnionTypeDefinition') {
        this.logger?.({ message: `Type ${typeName} not found in union ${type}`, level: 'error' });
        throw new Error(`Type ${typeName} not found in union ${type}`);
      }
      return unionTypeDef.fields;
    }
    if (typeDefinition.kind === 'InterfaceTypeDefinition' && typeName) {
      this.logger?.({
        message: `Resolving interface type ${type} with __typename: ${typeName}`,
        level: 'info',
      });
      const interfaceTypeDef = this.typeDefinitions.get(typeName);
      if (!interfaceTypeDef || interfaceTypeDef.kind !== 'ObjectTypeDefinition') {
        this.logger?.({
          message: `Type ${typeName} not found in interface ${type}`,
          level: 'error',
        });
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
    aliases: AliasMapping,
  ): any {
    if (result === null || result === undefined) {
      return result;
    }
    if (Array.isArray(result)) {
      this.logger?.({
        message: `Transforming array of ${result.length} items at path: ${path}`,
        level: 'info',
      });
      return result.map((item) => this.transform(item, type, path, aliases));
    }
    const transformDefinition = this.transformDefinitions[type];
    if (transformDefinition) {
      this.logger?.({
        message: `Applying custom scalar transformation for type ${type} at path: ${path}`,
        level: 'info',
      });
      return transformDefinition.parseValue(result);
    }
    if (typeof result !== 'object') {
      return result;
    }
    const fieldDefinitions = this.typeDefinitions.get(type);
    if (!fieldDefinitions) {
      this.logger?.({ message: `Type ${type} not found in type definitions`, level: 'error' });
      throw new Error(`Type ${type} not found`);
    }
    const fields = this.getFields(result, fieldDefinitions, type);
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('__')) {
        continue;
      }
      const fieldKeyWithoutAlias = this.resolveAlias(aliases, key, `${path}.${key}`, path);
      const definition = fields.get(fieldKeyWithoutAlias);
      if (!definition) {
        this.logger?.({
          message: `Field ${fieldKeyWithoutAlias} not found in type ${type}`,
          level: 'error',
        });
        throw new Error(`Field ${fieldKeyWithoutAlias} not found in type ${type}`);
      }
      result[key] = this.transform(value, definition.name, `${path}.${key}`, aliases);
    }
    return result;
  }

  private resolveAlias(
    aliases: AliasMapping,
    key: string,
    aliasPath: string,
    parentPath: string,
  ): string {
    const fieldName = aliases.get(aliasPath) ?? key;
    if (fieldName !== key) {
      this.logger?.({
        message: `Resolved alias ${key} to field ${fieldName} at path: ${parentPath}`,
        level: 'info',
      });
    }
    return fieldName;
  }

  /**
   * Transforms the custom scalars of an operation result in place. Pass the operation name to
   * resolve aliases from that operation only; without it, aliases from all operations are used.
   */
  addCustomScalars<T>(
    parsedValue: T,
    operationType: 'query' | 'mutation',
    operationName?: string,
  ): T {
    this.logger?.({
      message: `Starting scalar transformation for ${operationType}`,
      level: 'info',
    });

    if (!parsedValue) {
      this.logger?.({
        message: 'Parsed value is null or undefined, skipping transformation',
        level: 'info',
      });
      return parsedValue;
    }
    if (typeof parsedValue !== 'object') {
      this.logger?.({ message: 'Parsed value must be an object', level: 'error' });
      throw new Error('Parsed value must be an object');
    }
    const rootFields = operationType === 'query' ? this.queries : this.mutations;
    const rootName = operationType === 'query' ? 'Query' : 'Mutation';
    const operationAliases =
      operationName === undefined
        ? undefined
        : this.fieldNameByAliasPathByOperation.get(operationName);
    const aliases = operationAliases ?? this.fieldNameByAliasPath;
    for (const [key, value] of Object.entries(parsedValue)) {
      this.logger?.({ message: `Processing ${operationType}: ${key}`, level: 'info' });
      // Without the operation, a root alias from another operation could shadow a root field of
      // the same name, so root fields are only resolved as aliases when they are not in the schema.
      const fieldName =
        operationAliases || !rootFields.has(key)
          ? this.resolveAlias(aliases, key, key, operationType)
          : key;
      const rootField = rootFields.get(fieldName);
      if (!rootField) {
        this.logger?.({ message: `${rootName} ${fieldName} not found in schema`, level: 'error' });
        throw new Error(`${rootName} ${fieldName} not found`);
      }
      (parsedValue as any)[key] = this.transform(value, rootField.name, key, aliases);
    }

    this.logger?.({
      message: `Completed scalar transformation for ${operationType}`,
      level: 'info',
    });
    return parsedValue;
  }
}
