export interface FileEntry {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  is_file: boolean;
  is_symlink: boolean;
  modified: number | null;
  permissions: number | null;
}
