import type { FileEntry, TreeNode } from "../../types.js";
import { NON_TREE_EXTENSIONS } from "./constants.js";

export function buildTree(paths: string[]): TreeNode {
  const tree: TreeNode = {};
  const sortedPaths = [...paths].sort((left, right) =>
    left.localeCompare(right),
  );
  for (const path of sortedPaths) {
    let current = tree;
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      if (isLast) {
        current[parts[i]] = null;
      } else if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      if (!isLast) {
        current = current[parts[i]] as TreeNode;
      }
    }
  }
  return tree;
}

export function renderTree(node: TreeNode, prefix: string = ""): string {
  const keys = Object.keys(node).sort((left, right) =>
    left.localeCompare(right),
  );
  const lastConnector = "└── ";
  const normalConnector = "├── ";
  let result = "";

  keys.forEach((key, index) => {
    const isLast = index === keys.length - 1;
    const connector = isLast ? lastConnector : normalConnector;
    const childPrefix = isLast ? `${prefix}    ` : `${prefix}│   `;
    const isFolder = node[key] != null;
    result += `${prefix}${connector}${key}${isFolder ? "/" : ""}\n`;
    if (isFolder) {
      result += renderTree(node[key] as TreeNode, childPrefix);
    }
  });

  return result;
}

export function formatTree(paths: string[]): string {
  return renderTree(buildTree(paths));
}

function sanitizeFileContent(content: string): string {
  return content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatContext(files: FileEntry[], tree: string): string {
  const treeContent = `<tree>\n${tree}\n</tree>\n`;
  const convertedFiles = files.map((file) => {
    return `<file path="${file.relativePath}">\n${sanitizeFileContent(file.content)}\n</file> \n`;
  });
  return [treeContent, ...convertedFiles].join("\n");
}

export function filterTreePaths(paths: string[]): string[] {
  return paths.filter((path) => {
    const extension = path.split(".").pop();
    if (!extension || extension === path) {
      return true;
    }
    return !NON_TREE_EXTENSIONS.has(extension);
  });
}

export function getTreeInputPaths(files: FileEntry[]): string[] {
  return filterTreePaths(files.map((file) => file.relativePath));
}

export function buildSummaryContext(files: FileEntry[]): string {
  const treeInputPaths = getTreeInputPaths(files);
  const tree = formatTree(treeInputPaths);
  return formatContext(files, tree);
}
