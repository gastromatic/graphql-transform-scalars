import { FragmentDefinitionNode, parse, SelectionSetNode } from 'graphql';

type AliasMapping = Map<string, string>;

function joinPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}.${key}` : key;
}

function setSelectionSetAliases({
  fieldNameByAliasPath,
  getFragmentAliases,
  selectionSet,
  currentPath,
}: {
  fieldNameByAliasPath: AliasMapping;
  getFragmentAliases: (fragmentName: string) => AliasMapping | undefined;
  selectionSet: SelectionSetNode;
  currentPath: string;
}): void {
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const aliasOrName = selection.alias?.value ?? selection.name.value;
      const path = joinPath(currentPath, aliasOrName);
      if (selection.alias) {
        fieldNameByAliasPath.set(path, selection.name.value);
      }
      if (selection.selectionSet) {
        setSelectionSetAliases({
          fieldNameByAliasPath,
          getFragmentAliases,
          selectionSet: selection.selectionSet,
          currentPath: path,
        });
      }
    }
    if (selection.kind === 'InlineFragment' && selection.selectionSet) {
      setSelectionSetAliases({
        fieldNameByAliasPath,
        getFragmentAliases,
        selectionSet: selection.selectionSet,
        currentPath,
      });
    }
    if (selection.kind === 'FragmentSpread') {
      const fragmentAliases = getFragmentAliases(selection.name.value);
      for (const [aliasPath, fieldName] of fragmentAliases ?? []) {
        fieldNameByAliasPath.set(joinPath(currentPath, aliasPath), fieldName);
      }
    }
  }
}

export function getOperationFieldAliasMapping(schema: string): {
  fieldNameByAliasPath: AliasMapping;
} {
  const rootNode = parse(schema);

  const fragmentDefinitions = new Map<string, FragmentDefinitionNode>();
  for (const definition of rootNode.definitions) {
    if (definition.kind === 'FragmentDefinition') {
      fragmentDefinitions.set(definition.name.value, definition);
    } else if (definition.kind !== 'OperationDefinition') {
      throw new Error(`Schema contains unsupported definition(s) of kind: ${definition.kind}`);
    }
  }

  // Alias paths relative to the fragment, by fragment name. Fragments are resolved on first use,
  // so a fragment can spread another fragment that is defined later in the document.
  const fragmentFieldNameByAlias = new Map<string, AliasMapping>();
  const fragmentsBeingResolved = new Set<string>();
  const getFragmentAliases = (fragmentName: string): AliasMapping | undefined => {
    const resolved = fragmentFieldNameByAlias.get(fragmentName);
    if (resolved) {
      return resolved;
    }
    const definition = fragmentDefinitions.get(fragmentName);
    if (!definition || fragmentsBeingResolved.has(fragmentName)) {
      return undefined;
    }
    fragmentsBeingResolved.add(fragmentName);
    const fragmentAliases: AliasMapping = new Map();
    setSelectionSetAliases({
      fieldNameByAliasPath: fragmentAliases,
      getFragmentAliases,
      selectionSet: definition.selectionSet,
      currentPath: '',
    });
    fragmentsBeingResolved.delete(fragmentName);
    fragmentFieldNameByAlias.set(fragmentName, fragmentAliases);
    return fragmentAliases;
  };

  // Field names by alias path across all operations
  const fieldNameByAliasPath: AliasMapping = new Map();
  for (const definition of rootNode.definitions) {
    if (definition.kind === 'OperationDefinition') {
      setSelectionSetAliases({
        fieldNameByAliasPath,
        getFragmentAliases,
        selectionSet: definition.selectionSet,
        currentPath: '',
      });
    }
  }
  return { fieldNameByAliasPath };
}
