import os from 'os'
import path from 'path'
//used to resolve a local file path, expanding ~ to the user's home directory and resolving relative paths
export const resolveLocalPath = (filePath: string): string => {
  const expanded = filePath.replace(/^~(?=[\\/]|$)/, os.homedir())
  return path.resolve(expanded)
}
