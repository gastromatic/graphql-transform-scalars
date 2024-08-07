import { parse, SelectionSetNode } from 'graphql/index';

function setSelectionSetAliases(
  fieldNameByAliasPath: Map<string, string>,
  selectionSet: SelectionSetNode,
  currentPath: string,
): void {
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const aliasOrName = selection.alias?.value ?? selection.name.value;
      const path = currentPath ? `${currentPath}.${aliasOrName}` : aliasOrName;
      if (selection.alias) {
        fieldNameByAliasPath.set(path, selection.name.value);
      }
      if (selection.selectionSet) {
        setSelectionSetAliases(fieldNameByAliasPath, selection.selectionSet, path);
      }
    }
    if (selection.kind === 'InlineFragment' && selection.selectionSet) {
      setSelectionSetAliases(fieldNameByAliasPath, selection.selectionSet, currentPath);
    }
  }
}

export function getOperationFieldAliasMapping(schema: string): {
  fieldNameByAliasPath: Map<string, string>;
} {
  const fieldNameByAliasPath = new Map<string, string>();
  const rootNode = parse(schema);
  for (const definition of rootNode.definitions) {
    if (definition.kind !== 'OperationDefinition') {
      throw new Error(
        `operation definitions contain non-operation definition of kind ${definition.kind}`,
      );
    }
    setSelectionSetAliases(fieldNameByAliasPath, definition.selectionSet, '');
  }
  return { fieldNameByAliasPath };
}
