import { FragmentDefinitionNode, parse, SelectionSetNode } from 'graphql';

export type AliasEntry = {
  fieldName: string;
  /**
   * Type conditions per object along the alias path: index 0 is the operation (or fragment) root,
   * the last index is the object that contains the aliased field. An object matches when it
   * satisfies all conditions of its level.
   */
  typeConditions: string[][];
};

/** Alias entries by alias path, e.g. `authors.writtenWorks.blogTitle` */
export type AliasMapping = Map<string, AliasEntry[]>;

function joinPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}.${key}` : key;
}

function addAlias(aliases: AliasMapping, path: string, entry: AliasEntry): void {
  aliases.set(path, [...(aliases.get(path) ?? []), entry]);
}

function setSelectionSetAliases({
  fieldNameByAliasPath,
  getFragmentAliases,
  selectionSet,
  currentPath,
  typeConditions,
}: {
  fieldNameByAliasPath: AliasMapping;
  getFragmentAliases: (fragmentName: string) => AliasMapping | undefined;
  selectionSet: SelectionSetNode;
  currentPath: string;
  typeConditions: string[][];
}): void {
  const parentConditions = typeConditions.slice(0, -1);
  const currentConditions = typeConditions[typeConditions.length - 1];
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const aliasOrName = selection.alias?.value ?? selection.name.value;
      const path = joinPath(currentPath, aliasOrName);
      if (selection.alias) {
        addAlias(fieldNameByAliasPath, path, { fieldName: selection.name.value, typeConditions });
      }
      if (selection.selectionSet) {
        setSelectionSetAliases({
          fieldNameByAliasPath,
          getFragmentAliases,
          selectionSet: selection.selectionSet,
          currentPath: path,
          typeConditions: [...typeConditions, []],
        });
      }
    }
    if (selection.kind === 'InlineFragment' && selection.selectionSet) {
      const typeCondition = selection.typeCondition?.name.value;
      setSelectionSetAliases({
        fieldNameByAliasPath,
        getFragmentAliases,
        selectionSet: selection.selectionSet,
        currentPath,
        typeConditions: typeCondition
          ? [...parentConditions, [...currentConditions, typeCondition]]
          : typeConditions,
      });
    }
    if (selection.kind === 'FragmentSpread') {
      const fragmentAliases = getFragmentAliases(selection.name.value);
      for (const [aliasPath, entries] of fragmentAliases ?? []) {
        for (const entry of entries) {
          const [fragmentRootConditions, ...fragmentChildConditions] = entry.typeConditions;
          addAlias(fieldNameByAliasPath, joinPath(currentPath, aliasPath), {
            fieldName: entry.fieldName,
            typeConditions: [
              ...parentConditions,
              [...currentConditions, ...fragmentRootConditions],
              ...fragmentChildConditions,
            ],
          });
        }
      }
    }
  }
}

export function getOperationFieldAliasMapping(schema: string): {
  fieldNameByAliasPath: AliasMapping;
  fieldNameByAliasPathByOperation: Map<string, AliasMapping>;
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
      typeConditions: [[definition.typeCondition.name.value]],
    });
    fragmentsBeingResolved.delete(fragmentName);
    fragmentFieldNameByAlias.set(fragmentName, fragmentAliases);
    return fragmentAliases;
  };

  // Field names by alias path, per named operation and merged across all operations
  const fieldNameByAliasPath: AliasMapping = new Map();
  const fieldNameByAliasPathByOperation = new Map<string, AliasMapping>();
  for (const definition of rootNode.definitions) {
    if (definition.kind === 'OperationDefinition') {
      const operationAliases: AliasMapping = new Map();
      setSelectionSetAliases({
        fieldNameByAliasPath: operationAliases,
        getFragmentAliases,
        selectionSet: definition.selectionSet,
        currentPath: '',
        typeConditions: [[]],
      });
      for (const [aliasPath, entries] of operationAliases) {
        for (const entry of entries) {
          addAlias(fieldNameByAliasPath, aliasPath, entry);
        }
      }
      if (definition.name) {
        fieldNameByAliasPathByOperation.set(definition.name.value, operationAliases);
      }
    }
  }
  return { fieldNameByAliasPath, fieldNameByAliasPathByOperation };
}
