import type { CVDataDto } from "./cv-ai.dto";

export interface SaveCVRecordDto {
  id?: string;
  title?: string;
  source?: "manual" | "generated";
  fileName?: string;
  file_name?: string;
  fileSize?: number;
  file_size?: number;
  mimeType?: string;
  mime_type?: string;
  textContent?: string;
  text_content?: string;
  content?: CVDataDto;
  stats?: Record<string, unknown>;
  jobTarget?: string | null;
  job_target?: string | null;
  jobDescription?: string | null;
  job_description?: string | null;
  analysis?: Record<string, unknown> | null;
  optimization?: Record<string, unknown> | null;
  generated?: boolean;
  storagePath?: string | null;
  storage_path?: string | null;
}

export interface CVRecordDto {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  textContent: string;
  content?: CVDataDto | null;
  stats: Record<string, unknown>;
  jobTarget: string | null;
  jobDescription: string | null;
  analysis: Record<string, unknown> | null;
  optimization: Record<string, unknown> | null;
  generated: boolean;
  storagePath: string | null;
  uploadedAt: string;
  updatedAt: string;
}
