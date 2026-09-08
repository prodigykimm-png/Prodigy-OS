import ts from "typescript";

const mutationMethods = new Set([
  "append",
  "create",
  "createBinary",
  "delete",
  "modify",
  "process",
  "rename",
  "trash",
]);

function staticPropertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (!ts.isElementAccessExpression(node)) return null;
  const argument = node.argumentExpression;
  return argument && ts.isStringLiteralLike(argument) ? argument.text : null;
}

function isVaultExpression(node, vaultAliases) {
  if (ts.isIdentifier(node)) return node.text === "vault" || vaultAliases.has(node.text);
  return (
    staticPropertyName(node) === "vault" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "app"
  );
}

function bindingPropertyName(element) {
  const property = element.propertyName ?? element.name;
  return ts.isIdentifier(property) || ts.isStringLiteralLike(property) ? property.text : null;
}

function localBindingName(element) {
  return ts.isIdentifier(element.name) ? element.name.text : null;
}

function shadowBindings(name, vaultAliases, methodAliases) {
  if (ts.isIdentifier(name)) {
    vaultAliases.delete(name.text);
    methodAliases.delete(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      shadowBindings(element.name, vaultAliases, methodAliases);
    }
  }
}

function registerAliases(declaration, vaultAliases, methodAliases) {
  shadowBindings(declaration.name, vaultAliases, methodAliases);
  const initializer = declaration.initializer;
  if (!initializer) return;
  if (ts.isIdentifier(declaration.name)) {
    if (isVaultExpression(initializer, vaultAliases)) vaultAliases.add(declaration.name.text);
    return;
  }
  if (!ts.isObjectBindingPattern(declaration.name)) return;
  const destructuresApp = ts.isIdentifier(initializer) && initializer.text === "app";
  const destructuresVault = isVaultExpression(initializer, vaultAliases);
  for (const element of declaration.name.elements) {
    const property = bindingPropertyName(element);
    const local = localBindingName(element);
    if (property === null || local === null) continue;
    if (destructuresApp && property === "vault") vaultAliases.add(local);
    if (destructuresVault && mutationMethods.has(property)) methodAliases.set(local, property);
  }
}

export function findVaultMutations(sourceFile) {
  const mutations = [];
  const visit = (node, vaultAliases, methodAliases) => {
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) {
      const localVaults = new Set(vaultAliases);
      const localMethods = new Map(methodAliases);
      for (const statement of node.statements) visit(statement, localVaults, localMethods);
      return;
    }
    if (ts.isFunctionLike(node)) {
      const localVaults = new Set(vaultAliases);
      const localMethods = new Map(methodAliases);
      for (const parameter of node.parameters) {
        shadowBindings(parameter.name, localVaults, localMethods);
      }
      if (node.body) visit(node.body, localVaults, localMethods);
      return;
    }
    if (ts.isVariableStatement(node)) {
      const tracksAliases = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer) visit(declaration.initializer, vaultAliases, methodAliases);
        if (tracksAliases) registerAliases(declaration, vaultAliases, methodAliases);
        else shadowBindings(declaration.name, vaultAliases, methodAliases);
      }
      return;
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && methodAliases.has(node.expression.text)) {
        mutations.push({ node, method: methodAliases.get(node.expression.text) });
      } else {
        const method = staticPropertyName(node.expression);
        if (
          method !== null &&
          mutationMethods.has(method) &&
          isVaultExpression(node.expression.expression, vaultAliases)
        ) {
          mutations.push({ node, method });
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, vaultAliases, methodAliases));
  };
  visit(sourceFile, new Set(), new Map());
  return mutations;
}
