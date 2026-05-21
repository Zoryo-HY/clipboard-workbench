export type CategoryId = 'all' | 'text' | 'link' | 'image' | 'file' | 'code' | 'favorite';

export interface ClipboardItem {
  id: number;
  content_type: string;
  content: string;
  size: number;
  is_favorite: boolean;
  created_at: string;
}

export interface Settings {
  max_text_length: number;
  max_image_size_mb: number;
  max_file_size_mb: number;
  total_storage_limit_mb: number;
  auto_clean_days: number;
  start_minimized: boolean;
  storage_path: string;
}

export type View = 'history' | 'settings';
