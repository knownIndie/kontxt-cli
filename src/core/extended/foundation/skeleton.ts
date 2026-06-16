import ts from "typescript";
import type { FileEntry } from "../../types.js";
import { countTokens } from "./tokenize.js";

const SUPPORTED_EXTENSIONS = new Set([
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
]);

const STRUCTURAL_PATTERNS = [
  /^\s*import\s.+/,
  /^\s*export\s+(type|interface|enum|class|function|async\s+function|const|let|var)\b.+/,
  /^\s*(export\s+)?(abstract\s+)?class\s+\w.+/,
  /^\s*(export\s+)?interface\s+\w.+/,
  /^\s*(export\s+)?type\s+\w.+/,
  /^\s*(export\s+)?enum\s+\w.+/,
  /^\s*(export\s+)?(async\s+)?function\s+\w.+/,
  /^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>.+/,
  /^\s*(describe|test|it)\s*\(.+/,
];

const START_STRUCTURAL_PATTERNS = [
  /^\s*export\s+(type|interface|enum|class|function|async\s+function|const|let|var)\b/,
  /^\s*(export\s+)?(abstract\s+)?class\s+\w/,
  /^\s*(export\s+)?interface\s+\w/,
  /^\s*(export\s+)?type\s+\w/,
  /^\s*(export\s+)?enum\s+\w/,
  /^\s*(export\s+)?(async\s+)?function\s+\w/,
  /^\s*(const|let|var)\s+\w+\s*=/,
];

function getExtension(relativePath: string): string | undefined {
  const fileName = relativePath.split("/").pop();
  const extension = fileName?.split(".").pop();
  if (!extension || extension === fileName) {
    return undefined;
  }
  return extension.toLowerCase();
}

function isSupportedSourceFile(relativePath: string): boolean {
  const extension = getExtension(relativePath);
  return extension !== undefined && SUPPORTED_EXTENSIONS.has(extension);
}

function stripInlineBody(line: string): string {
  if (/^\s*import\s/.test(line)) {
    return line.trimEnd();
  }

  const openBraceIndex = line.indexOf("{");
  if (openBraceIndex === -1) {
    return line.trimEnd();
  }

  const beforeBrace = line.slice(0, openBraceIndex).trimEnd();
  if (!beforeBrace) {
    return line.trimEnd();
  }

  return `${beforeBrace} { ... }`;
}

function isStructuralStart(line: string): boolean {
  return START_STRUCTURAL_PATTERNS.some((pattern) => pattern.test(line));
}

function isTestStart(line: string): boolean {
  return /^\s*(describe|test|it)\s*\(/.test(line);
}

function compactSignatureLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function collapseSignature(lines: string[]): string {
  const signature = lines.map(compactSignatureLine).join(" ");
  if (/\s=>\s\{\s*$/.test(signature)) {
    return signature.replace(/\s=>\s\{\s*$/, " => { ... }");
  }
  if (/\{\s*$/.test(signature)) {
    return signature.replace(/\s\{\s*$/, " { ... }");
  }
  return stripInlineBody(signature);
}

function collapseTestName(line: string): string {
  const match = line.match(/^\s*(describe|test|it)\s*\(\s*(['"`])(.+?)\2/);
  if (!match) {
    return stripInlineBody(line);
  }

  return `${match[1]}(${match[2]}${match[3]}${match[2]});`;
}

function getSourceKind(relativePath: string): ts.ScriptKind {
  const extension = getExtension(relativePath);
  switch (extension) {
    case "js":
    case "mjs":
    case "cjs":
      return ts.ScriptKind.JS;
    case "jsx":
      return ts.ScriptKind.JSX;
    case "tsx":
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

function getNodeText(sourceFile: ts.SourceFile, node: ts.Node): string {
  return sourceFile.text.slice(node.getStart(sourceFile), node.getEnd());
}

function getLeadingModifiersText(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): string {
  if (!ts.canHaveModifiers(node)) {
    return "";
  }

  const modifiers = ts.getModifiers(node);
  if (!modifiers || modifiers.length === 0) {
    return "";
  }

  return `${modifiers.map((modifier) => modifier.getText(sourceFile)).join(" ")} `;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getFunctionLikeSignature(
  sourceFile: ts.SourceFile,
  node: ts.FunctionLikeDeclaration,
): string | null {
  if (!node.body) {
    return `${collapseWhitespace(getNodeText(sourceFile, node))};`;
  }

  const signature = sourceFile.text
    .slice(node.getStart(sourceFile), node.body.getStart(sourceFile))
    .trim();
  if (!signature) {
    return null;
  }

  return `${collapseWhitespace(signature)} { ... }`;
}

function getVariableSignature(
  sourceFile: ts.SourceFile,
  statement: ts.VariableStatement,
): string | null {
  const declarations = statement.declarationList.declarations;
  if (declarations.length !== 1) {
    return `${collapseWhitespace(getNodeText(sourceFile, statement))}`;
  }

  const declaration = declarations[0];
  const initializer = declaration.initializer;
  const declarationName = getNodeText(sourceFile, declaration.name);
  const modifiers = getLeadingModifiersText(sourceFile, statement);
  const declarationKind =
    ts.tokenToString(
      statement.declarationList.flags & ts.NodeFlags.Const
        ? ts.SyntaxKind.ConstKeyword
        : ts.SyntaxKind.LetKeyword,
    ) ?? "const";

  if (
    initializer &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
  ) {
    const prefix = sourceFile.text
      .slice(declaration.getStart(sourceFile), initializer.getStart(sourceFile))
      .trimEnd();
    const signature = getFunctionLikeSignature(sourceFile, initializer);
    if (signature === null) {
      return null;
    }

    return `${modifiers}${declarationKind} ${prefix} ${signature};`;
  }

  if (
    ts
      .getModifiers(statement)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    return collapseWhitespace(getNodeText(sourceFile, statement));
  }

  if (/^(describe|test|it)$/.test(declarationName)) {
    return collapseWhitespace(getNodeText(sourceFile, statement));
  }

  return null;
}

function getClassSkeleton(
  sourceFile: ts.SourceFile,
  node: ts.ClassDeclaration,
): string {
  const classStart = node.getStart(sourceFile);
  const openBraceIndex = sourceFile.text.indexOf(
    "{",
    node.name?.getEnd() ?? classStart,
  );
  const header =
    openBraceIndex === -1
      ? getNodeText(sourceFile, node)
      : sourceFile.text.slice(classStart, openBraceIndex).trim();
  const memberLines: string[] = [];

  for (const member of node.members) {
    if (
      ts.isMethodDeclaration(member) ||
      ts.isConstructorDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      const signature = getFunctionLikeSignature(sourceFile, member);
      if (signature !== null) {
        memberLines.push(`  ${signature}`);
      }
      continue;
    }

    if (ts.isPropertyDeclaration(member)) {
      const propertyText = member.initializer
        ? sourceFile.text
            .slice(
              member.getStart(sourceFile),
              member.initializer.getStart(sourceFile),
            )
            .trimEnd()
        : getNodeText(sourceFile, member).trimEnd();
      memberLines.push(`  ${collapseWhitespace(propertyText)};`);
    }
  }

  if (memberLines.length === 0) {
    return `${collapseWhitespace(header)} { ... }`;
  }

  return `${collapseWhitespace(header)} {\n${memberLines.join("\n")}\n}`;
}

function getTestName(node: ts.CallExpression): string | null {
  if (!ts.isIdentifier(node.expression)) {
    return null;
  }
  if (!["describe", "test", "it"].includes(node.expression.text)) {
    return null;
  }

  const [nameArg] = node.arguments;
  if (!nameArg || !ts.isStringLiteralLike(nameArg)) {
    return null;
  }

  return `${node.expression.text}(${JSON.stringify(nameArg.text)});`;
}

function createAstSkeleton(
  content: string,
  relativePath: string,
): string | null {
  const sourceFile = ts.createSourceFile(
    relativePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getSourceKind(relativePath),
  );
  const skeletonLines: string[] = [];

  function visitTopLevelStatement(statement: ts.Statement): void {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement)
    ) {
      skeletonLines.push(getNodeText(sourceFile, statement));
      return;
    }

    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      skeletonLines.push(getNodeText(sourceFile, statement));
      return;
    }

    if (ts.isFunctionDeclaration(statement)) {
      const signature = getFunctionLikeSignature(sourceFile, statement);
      if (signature !== null) {
        skeletonLines.push(signature);
      }
      return;
    }

    if (ts.isClassDeclaration(statement)) {
      skeletonLines.push(getClassSkeleton(sourceFile, statement));
      return;
    }

    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      skeletonLines.push(
        collapseWhitespace(getNodeText(sourceFile, statement)),
      );
      return;
    }

    if (ts.isVariableStatement(statement)) {
      const signature = getVariableSignature(sourceFile, statement);
      if (signature !== null) {
        skeletonLines.push(signature);
      }
      return;
    }

    if (
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression)
    ) {
      const testName = getTestName(statement.expression);
      if (testName !== null) {
        skeletonLines.push(testName);
      }
    }
  }

  for (const statement of sourceFile.statements) {
    visitTopLevelStatement(statement);
  }

  if (skeletonLines.length === 0) {
    return null;
  }

  return skeletonLines.join("\n");
}

export function createCodeSkeleton(content: string): string | null {
  const skeletonLines: string[] = [];
  const lines = content.split("\n").map((line) => line.trimEnd());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }

    if (/^\s*import\s/.test(line)) {
      skeletonLines.push(line);
      continue;
    }

    if (isTestStart(line)) {
      skeletonLines.push(collapseTestName(line));
      continue;
    }

    if (isStructuralStart(line)) {
      const signatureLines = [line];
      while (
        !/[{;]\s*$/.test(signatureLines.at(-1) ?? "") &&
        index + 1 < lines.length
      ) {
        index += 1;
        signatureLines.push(lines[index]);
      }

      skeletonLines.push(collapseSignature(signatureLines));
      continue;
    }

    if (STRUCTURAL_PATTERNS.some((pattern) => pattern.test(line))) {
      skeletonLines.push(stripInlineBody(line));
    }
  }

  if (skeletonLines.length === 0) {
    return null;
  }

  return skeletonLines.join("\n");
}

export function createSkeletonForPath(
  content: string,
  relativePath: string,
): string | null {
  return (
    createAstSkeleton(content, relativePath) ?? createCodeSkeleton(content)
  );
}

export function skeletonizeFile(file: FileEntry): FileEntry {
  if (!isSupportedSourceFile(file.relativePath)) {
    return file;
  }

  const skeleton = createSkeletonForPath(file.content, file.relativePath);
  if (skeleton === null) {
    return file;
  }

  return {
    ...file,
    tokenCount: countTokens(skeleton),
    content: skeleton,
  };
}

export function skeletonizeFiles(files: FileEntry[]): FileEntry[] {
  return files.map(skeletonizeFile);
}
