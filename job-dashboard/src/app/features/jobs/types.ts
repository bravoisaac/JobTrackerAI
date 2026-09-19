import type { CandidateProfile } from '../profile/profile.store';

export interface Job {
  id: number;
  titulo: string;
  empresa: string;
  descripcion: string;
  link: string;
  ubicacion: string;
  aplicado: boolean;
  match_score: number;

  // Opcionales para enriquecer la UI si tu backend los expone
  tecnologias?: string[];
  ia_razones?: string[];
  aplicado_at?: string;
  application_status?: 'ready_for_review' | 'submitted';
  application_platform?: ApplicationPlatformId;
  application_mode?: 'assisted';
  application_prepared_at?: string;
  application_next_action?: string;
}

export type ApplicationPlatformId = 'linkedin' | 'computrabajo' | 'external';

export interface PrepareApplicationsRequest {
  platforms: ApplicationPlatformId[];
  min_score: number;
  limit?: number;
  profile: CandidateProfile;
}

export interface PrepareApplicationsResponse {
  prepared: Job[];
  total: number;
  mode: 'assisted';
  message: string;
}

export interface Application {
  id: number;
  job_id: number;
  correo: string;
  mensaje_linkedin: string;
}

export type CreateJobRequest = Omit<Job, 'id'>;

export interface GenerateRequest {
  job_id: number;
  profile?: CandidateProfile;
}

export interface GenerateResponse {
  correo: string;
  mensaje_linkedin: string;
  cv?: string;
  mock?: boolean;
}

export interface DiscoverJobsRequest {
  query: string;
  technologies?: string[];
  location?: string;
  limit?: number;
}

export interface DiscoveredJob {
  titulo: string;
  empresa: string;
  descripcion?: string;
  link: string;
  ubicacion?: string;
  match_score?: number;
  tecnologias?: string[];
  ia_razones?: string[];
}

export interface DiscoverJobsResponse {
  jobs: DiscoveredJob[];
}

export type BrowserAgentStatus = 'running' | 'completed' | 'failed';

export interface BrowserAgentRequest {
  profile: CandidateProfile;
  platforms: ApplicationPlatformId[];
  preferredTechnology?: string;
  location?: string;
  min_score: number;
  limit?: number;
}

export interface BrowserAgentSession {
  id: string;
  status: BrowserAgentStatus;
  phase: string;
  message: string;
  progress: number;
  current_platform?: ApplicationPlatformId;
  found: number;
  imported: number;
  prepared: number;
  warnings: string[];
  results: Job[];
  started_at: string;
  finished_at?: string;
}

export function applicationPlatformLabel(platform?: ApplicationPlatformId) {
  if (platform === 'linkedin') return 'LinkedIn';
  if (platform === 'computrabajo') return 'Computrabajo';
  return 'Otro portal';
}
