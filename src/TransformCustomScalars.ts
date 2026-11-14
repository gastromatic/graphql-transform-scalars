import { GraphQLScalarType } from 'graphql';
import { FieldTypeDefinition, getSchemaDefinition, TypeDefinition } from './getSchemaDefinition';
import { AliasMapping, getOperationFieldAliasMapping } from './getOperationFieldAliasMapping';

type StringTransformerFunction = (value: string) => any;
type BooleanTransformerFunction = (value: boolean) => any;
type NumberTransformerFunction = (value: number) => any;
export type TransformFunctionType =
  | StringTransformerFunction
  | BooleanTransformerFunction
  | NumberTransformerFunction;
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
  ): { fields: Map<string, FieldTypeDefinition>; typeName: string } {
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
      return { fields: unionTypeDef.fields, typeName: unionType };
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
      return { fields: interfaceTypeDef.fields, typeName };
    }
    return { fields: typeDefinition.fields, typeName: type };
  }

  private transform(
    result: Record<string, any> | Record<string, any>[] | string | number | boolean | null,
    type: string,
    path: string,
    aliases: AliasMapping,
    parentTypeNames: string[],
  ): any {
    if (result === null || result === undefined) {
      return result;
    }
    if (Array.isArray(result)) {
      this.logger?.({
        message: `Transforming array of ${result.length} items at path: ${path}`,
        level: 'info',
      });
      return result.map((item) => this.transform(item, type, path, aliases, parentTypeNames));
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
    const { fields, typeName } = this.getFields(result, fieldDefinitions, type);
    const typeNames = [...parentTypeNames, typeName];
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('__')) {
        continue;
      }
      const fieldKeyWithoutAlias = this.resolveAlias(
        aliases,
        key,
        `${path}.${key}`,
        path,
        typeNames,
      );
      const definition = fields.get(fieldKeyWithoutAlias);
      if (!definition) {
        this.logger?.({
          message: `Field ${fieldKeyWithoutAlias} not found in type ${type}`,
          level: 'error',
        });
        throw new Error(`Field ${fieldKeyWithoutAlias} not found in type ${type}`);
      }
      result[key] = this.transform(value, definition.name, `${path}.${key}`, aliases, typeNames);
    }
    return result;
  }

  private resolveAlias(
    aliases: AliasMapping,
    key: string,
    aliasPath: string,
    parentPath: string,
    typeNames: string[],
  ): string {
    // The last matching alias wins, so with aliases merged across operations later ones take
    // precedence
    const entry = [...(aliases.get(aliasPath) ?? [])]
      .reverse()
      .find((aliasEntry) =>
        aliasEntry.typeConditions.every((conditions, level) =>
          conditions.every((condition) => this.mayMatchTypeCondition(typeNames[level], condition)),
        ),
      );
    const fieldName = entry?.fieldName ?? key;
    if (fieldName !== key) {
      this.logger?.({
        message: `Resolved alias ${key} to field ${fieldName} at path: ${parentPath}`,
        level: 'info',
      });
    }
    return fieldName;
  }

  /**
   * Whether an object of the given type can be selected by `... on typeCondition`. For an interface
   * result without `__typename` the concrete type is unknown, so any condition that overlaps with
   * the interface matches.
   */
  private mayMatchTypeCondition(typeName: string | undefined, typeCondition: string): boolean {
    if (typeName === undefined) {
      return false;
    }
    const conditionTypes = this.getPossibleTypes(typeCondition);
    if (typeName === typeCondition || conditionTypes.includes(typeName)) {
      return true;
    }
    if (this.typeDefinitions.get(typeName)?.kind === 'ObjectTypeDefinition') {
      return false;
    }
    return this.getPossibleTypes(typeName).some((type) => conditionTypes.includes(type));
  }

  private getPossibleTypes(typeName: string): string[] {
    const typeDefinition = this.typeDefinitions.get(typeName);
    if (!typeDefinition) {
      return [];
    }
    return typeDefinition.kind === 'ObjectTypeDefinition' ? [typeName] : typeDefinition.types;
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
          ? this.resolveAlias(aliases, key, key, operationType, [rootName])
          : key;
      const rootField = rootFields.get(fieldName);
      if (!rootField) {
        this.logger?.({ message: `${rootName} ${fieldName} not found in schema`, level: 'error' });
        throw new Error(`${rootName} ${fieldName} not found`);
      }
      (parsedValue as any)[key] = this.transform(value, rootField.name, key, aliases, [rootName]);
    }

    this.logger?.({
      message: `Completed scalar transformation for ${operationType}`,
      level: 'info',
    });
    return parsedValue;
  }
}
