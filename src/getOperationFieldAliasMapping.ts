import { parse, SelectionSetNode } from 'graphql/index';

function setSelectionSetAliases({
  fieldNameByAliasPath,
  fragmentFieldNameByAlias,
  selectionSet,
  currentPath,
}: {
  fieldNameByAliasPath: Map<string, string>;
  fragmentFieldNameByAlias: Map<string, Map<string, string>>;
  selectionSet: SelectionSetNode;
  currentPath: string;
}): void {
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const aliasOrName = selection.alias?.value ?? selection.name.value;
      const path = currentPath ? `${currentPath}.${aliasOrName}` : aliasOrName;
      if (selection.alias) {
        fieldNameByAliasPath.set(path, selection.name.value);
      }
      if (selection.selectionSet) {
        setSelectionSetAliases({
          fieldNameByAliasPath,
          fragmentFieldNameByAlias,
          selectionSet: selection.selectionSet,
          currentPath: path,
        });
      }
    }
    if (selection.kind === 'InlineFragment' && selection.selectionSet) {
      setSelectionSetAliases({
        fieldNameByAliasPath,
        fragmentFieldNameByAlias,
        selectionSet: selection.selectionSet,
        currentPath,
      });
    }
    if (selection.kind === 'FragmentSpread') {
      const fragmentAliases = fragmentFieldNameByAlias.get(selection.name.value);
      if (fragmentAliases) {
        for (const [alias, fieldName] of fragmentAliases.entries()) {
          fieldNameByAliasPath.set(`${currentPath}.${alias}`, fieldName);
        }
      }
    }
  }
}

export function getOperationFieldAliasMapping(schema: string): {
  fieldNameByAliasPath: Map<string, string>;
} {
  const rootNode = parse(schema);

  for (const definition of rootNode.definitions) {
    if (definition.kind !== 'OperationDefinition' && definition.kind !== 'FragmentDefinition') {
      throw new Error(
        `operation definitions contain non-operation definition of kind ${definition.kind}`,
      );
    }
  }

  // This is a mapping of alias (nested key) to field name (nested value) mapped by fragment name (key)
  const fragmentFieldNameByAlias = new Map<string, Map<string, string>>();
  for (const definition of rootNode.definitions.filter(
    (def) => def.kind === 'FragmentDefinition',
  )) {
    const fragmentAliases = new Map<string, string>();
    setSelectionSetAliases({
      fieldNameByAliasPath: fragmentAliases,
      fragmentFieldNameByAlias,
      selectionSet: definition.selectionSet,
      currentPath: '',
    });
    fragmentFieldNameByAlias.set(definition.name.value, fragmentAliases);
  }

  // This maps all operation field names(value) by alias path(key)
  const fieldNameByAliasPath = new Map<string, string>();
  for (const definition of rootNode.definitions.filter(
    (def) => def.kind === 'OperationDefinition',
  )) {
    setSelectionSetAliases({
      fieldNameByAliasPath,
      fragmentFieldNameByAlias,
      selectionSet: definition.selectionSet,
      currentPath: '',
    });
  }
  return { fieldNameByAliasPath };
}
