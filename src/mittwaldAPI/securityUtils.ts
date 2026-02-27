export function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes in the argument
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

export function validatePath(path: string): void {
  // Reject paths with null bytes
  if (path.includes("\0")) {
    throw new Error("Invalid path: contains null byte");
  }

  // Reject paths that try to escape using backticks or command substitution
  if (/[`$()]/.test(path)) {
    throw new Error("Invalid path: contains shell metacharacters");
  }

  // Reject paths with newlines or carriage returns
  if (/[\r\n]/.test(path)) {
    throw new Error("Invalid path: contains newline characters");
  }
}

export function validatePermissions(permissions: string): void {
  // Only allow valid chmod permission patterns
  const validPermissionPattern = /^[0-7]{3,4}$|^[ugoa]*[+-=][rwxXst]+$/;
  if (!validPermissionPattern.test(permissions)) {
    throw new Error("Invalid permissions format");
  }
}
