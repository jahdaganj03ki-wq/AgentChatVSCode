import * as path from 'path';

const mimeMap: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/jsx',
  '.css': 'text/css',
  '.html': 'text/html',
  '.xml': 'text/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.sh': 'text/x-shellscript',
  '.bat': 'text/x-bat',
  '.ps1': 'text/x-powershell',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c-header',
  '.sql': 'text/x-sql',
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  '.dockerignore': 'text/plain',
  '.editorconfig': 'text/plain',
};

export function getMimeType(uri: { path: string; fsPath?: string }): string {
  const fileName = uri.path.split('/').pop() || '';
  if (mimeMap[fileName]) return mimeMap[fileName];
  const ext = path.extname(fileName).toLowerCase();
  return mimeMap[ext] || 'application/octet-stream';
}
