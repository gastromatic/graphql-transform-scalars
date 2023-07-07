import { ListTypeNode, NamedTypeNode, NonNullTypeNode, parse } from 'graphql';

export type FieldTypeDefinition = {
  name: string;
  isList?: boolean;
  isNonNull?: boolean;
};

function getTypeDefinition(
  fieldType: NamedTypeNode | ListTypeNode | NonNullTypeNode,
): FieldTypeDefinition {
  if (fieldType.kind === 'NamedType') {
    return { name: fieldType.name.value };
  }
  if (fieldType.kind === 'NonNullType') {
    return {
      ...getTypeDefinition(fieldType.type),
      isNonNull: true,
    };
  }
  if (fieldType.kind === 'ListType') {
    return {
      ...getTypeDefinition(fieldType.type),
      isList: true,
    };
  }
  throw new Error('Unknown type');
}

export function getSchemaDefinition(schema: string) {
  const rootNode = parse(schema);
  const queries = new Map<string, FieldTypeDefinition>();
  const mutations = new Map<string, FieldTypeDefinition>();
  const objects = new Map<string, Map<string, FieldTypeDefinition>>();

  for (const n of rootNode.definitions) {
    if (n.kind === 'ObjectTypeDefinition') {
      if (n.name.value === 'Query') {
        for (const field of n.fields || []) {
          queries.set(field.name.value, getTypeDefinition(field.type));
        }
      }
      if (n.name.value === 'Mutation') {
        for (const field of n.fields || []) {
          mutations.set(field.name.value, getTypeDefinition(field.type));
        }
      }
      const fields = new Map<string, FieldTypeDefinition>();
      for (const field of n.fields || []) {
        fields.set(field.name.value, getTypeDefinition(field.type));
      }
      objects.set(n.name.value, fields);
    }
  }
  return { queries, mutations, objects };
}
