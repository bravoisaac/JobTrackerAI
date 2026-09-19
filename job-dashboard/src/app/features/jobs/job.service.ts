import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { API_BASE_URL } from '../../core/config/api-base-url';
import {
  BrowserAgentRequest,
  BrowserAgentSession,
  CreateJobRequest,
  DiscoverJobsRequest,
  DiscoverJobsResponse,
  GenerateRequest,
  GenerateResponse,
  Job,
  PrepareApplicationsRequest,
  PrepareApplicationsResponse,
} from './types';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getJobs() {
    return this.http.get<Job[]>(`${this.baseUrl}/jobs`).pipe(catchError((e) => this.toApiError(e)));
  }

  createJob(payload: CreateJobRequest) {
    return this.http
      .post<Job>(`${this.baseUrl}/jobs`, payload)
      .pipe(catchError((e) => this.toApiError(e)));
  }

  apply(id: number) {
    return this.http
      .put<Job | { ok: boolean }>(`${this.baseUrl}/jobs/${id}/apply`, {})
      .pipe(catchError((e) => this.toApiError(e)));
  }

  prepareApplications(payload: PrepareApplicationsRequest) {
    return this.http
      .post<PrepareApplicationsResponse>(`${this.baseUrl}/applications/prepare-batch`, payload)
      .pipe(catchError((e) => this.toApiError(e)));
  }

  generate(payload: GenerateRequest) {
    return this.http
      .post<GenerateResponse>(`${this.baseUrl}/generate`, payload)
      .pipe(catchError((e) => this.toApiError(e)));
  }

  discoverJobs(payload: DiscoverJobsRequest) {
    // Nota: este endpoint debe existir en tu FastAPI y encargarse de la IA/búsqueda.
    // Recomendado: POST /discover -> { jobs: [{ titulo, empresa, link, ... }] }
    return this.http
      .post<DiscoverJobsResponse>(`${this.baseUrl}/discover`, payload)
      .pipe(catchError((e) => this.toApiError(e)));
  }

  startBrowserAgent(payload: BrowserAgentRequest) {
    return this.http
      .post<BrowserAgentSession>(`${this.baseUrl}/browser-agent/start`, payload)
      .pipe(catchError((e) => this.toApiError(e)));
  }

  getBrowserAgentStatus(id: string) {
    return this.http
      .get<BrowserAgentSession>(`${this.baseUrl}/browser-agent/status/${encodeURIComponent(id)}`)
      .pipe(catchError((e) => this.toApiError(e)));
  }

  private toApiError(err: unknown) {
    if (err instanceof HttpErrorResponse) {
      const message = err.error?.detail ?? err.message ?? 'Error de red';
      const apiErr: ApiError = { status: err.status, message: String(message), details: err.error };
      return throwError(() => apiErr);
    }
    const apiErr: ApiError = { status: 0, message: 'Error inesperado', details: err };
    return throwError(() => apiErr);
  }
}
