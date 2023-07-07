import { ListTypeNode, NamedTypeNode, NonNullTypeNode, parse } from 'graphql';

export type FieldTypeDefinition = {
  name: string;
  isList?: boolean;
  isNonNull?: boolean;
};

export type ObjectDefinition = {
  kind: 'ObjectTypeDefinition';
  fields: Map<string, FieldTypeDefinition>;
};

export type InterfaceDefinition = {
  kind: 'InterfaceTypeDefinition';
  fields: Map<string, FieldTypeDefinition>;
  types: string[];
};

export type UnionDefinition = {
  kind: 'UnionTypeDefinition';
  types: string[];
};

export type TypeDefinition = ObjectDefinition | InterfaceDefinition | UnionDefinition;

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
  const typeDefinitions = new Map<string, TypeDefinition>();

  const interfaceMap = new Map<string, string[]>();

  for (const n of rootNode.definitions) {
    if (n.kind === 'ObjectTypeDefinition' || n.kind === 'InterfaceTypeDefinition') {
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
      if (n.kind === 'InterfaceTypeDefinition') {
        typeDefinitions.set(n.name.value, { kind: n.kind, fields, types: [] });
      } else {
        typeDefinitions.set(n.name.value, { kind: n.kind, fields });
      }
      for (const interfaceDef of n.interfaces || []) {
        interfaceMap.set(interfaceDef.name.value, [
          ...(interfaceMap.get(interfaceDef.name.value) || []),
          n.name.value,
        ]);
      }
    }
    if (n.kind === 'UnionTypeDefinition') {
      typeDefinitions.set(n.name.value, {
        kind: n.kind,
        types: (n.types || []).map((type) => type.name.value),
      });
    }
  }

  for (const [interfaceName, types] of interfaceMap.entries()) {
    const interfaceDef = typeDefinitions.get(interfaceName);
    if (!interfaceDef || interfaceDef.kind !== 'InterfaceTypeDefinition') {
      throw new Error(`Interface ${interfaceName} not found`);
    }
    interfaceDef.types.push(...types);
  }

  return { queries, mutations, typeDefinitions };
}
