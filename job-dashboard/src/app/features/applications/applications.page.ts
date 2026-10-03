import { AsyncPipe, DatePipe, NgClass } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { map, switchMap, takeWhile, timer } from 'rxjs';

import { JobService } from '../jobs/job.service';
import { JobsStore } from '../jobs/jobs.store';
import {
  ApplicationAgentSession,
  BrowserNavigationEvent,
  applicationPlatformLabel,
  Job,
} from '../jobs/types';
import { ProfileStore } from '../profile/profile.store';

@Component({
  selector: 'app-applications-page',
  imports: [
    AsyncPipe,
    DatePipe,
    NgClass,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './applications.page.html',
  styleUrl: './applications.page.scss',
})
export class ApplicationsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly jobService = inject(JobService);
  private readonly profileStore = inject(ProfileStore);
  private readonly snackBar = inject(MatSnackBar);
  readonly jobsStore = inject(JobsStore);
  readonly platformLabel = applicationPlatformLabel;
  readonly automationByJob = signal<Record<number, ApplicationAgentSession>>({});

  readonly vm$ = this.jobsStore.jobs$.pipe(
    map((jobs) => {
      const trackedJobs = jobs
        .filter((job) => job.aplicado || job.application_status === 'ready_for_review')
        .sort(
          (a, b) =>
            dateValue(b.aplicado_at ?? b.application_prepared_at) -
            dateValue(a.aplicado_at ?? a.application_prepared_at),
        );

      const averageScore = trackedJobs.length
        ? Math.round(
            trackedJobs.reduce((total, job) => total + (job.match_score ?? 0), 0) /
              trackedJobs.length,
          )
        : 0;

      return {
        trackedJobs,
        submittedCount: trackedJobs.filter((job) => job.aplicado).length,
        readyCount: trackedJobs.filter((job) => !job.aplicado).length,
        averageScore,
        lastApplicationDate: trackedJobs.find((job) => job.aplicado)?.aplicado_at ?? '',
      };
    }),
  );

  constructor() {
    this.jobsStore.ensureLoaded();
  }

  openOffer(job: Job) {
    if (job.link) window.open(job.link, '_blank', 'noopener');
  }

  autoApply(job: Job) {
    if (job.aplicado || this.isAutomationRunning(job.id)) return;
    if (!this.profileStore.hasPersonalData()) {
      this.snackBar.open('Completa nombre y email en tu perfil antes de postular.', 'Cerrar', {
        duration: 4500,
      });
      return;
    }

    this.jobService
      .startApplicationAgent(job.id, { profile: this.profileStore.snapshot() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.saveAutomation(session);
          this.watchAutomation(session.id);
        },
        error: (error) => {
          const existing = error?.details?.session as ApplicationAgentSession | undefined;
          if (existing?.id) {
            this.saveAutomation(existing);
            this.watchAutomation(existing.id);
          }
          this.snackBar.open(error?.message ?? 'No se pudo iniciar la postulación.', 'Cerrar', {
            duration: 5000,
          });
        },
      });
  }

  automationFor(jobId: number) {
    return this.automationByJob()[jobId];
  }

  isAutomationRunning(jobId: number) {
    return this.automationFor(jobId)?.status === 'running';
  }

  recentNavigation(session: ApplicationAgentSession): BrowserNavigationEvent[] {
    return [...(session.navigation_history ?? [])].slice(-3).reverse();
  }

  private watchAutomation(id: string) {
    timer(0, 1_500)
      .pipe(
        switchMap(() => this.jobService.getApplicationAgentStatus(id)),
        takeWhile((session) => session.status === 'running', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (session) => {
          this.saveAutomation(session);
          if (session.status === 'completed') {
            if (session.job) this.jobsStore.replaceJob(session.job);
            else this.jobsStore.loadJobs();
            this.snackBar.open(session.message, 'Cerrar', { duration: 6000 });
          } else if (session.status === 'failed') {
            this.snackBar.open(session.message, 'Cerrar', { duration: 7000 });
          }
        },
        error: (error) => {
          this.snackBar.open(error?.message ?? 'Se perdió la conexión con el agente.', 'Cerrar', {
            duration: 5000,
          });
        },
      });
  }

  private saveAutomation(session: ApplicationAgentSession) {
    this.automationByJob.update((current) => ({ ...current, [session.job_id]: session }));
  }
}

function dateValue(value?: string) {
  return value ? new Date(value).getTime() || 0 : 0;
}
