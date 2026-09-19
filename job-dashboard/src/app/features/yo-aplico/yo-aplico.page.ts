import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { switchMap, takeWhile, timer } from 'rxjs';

import { JobService } from '../jobs/job.service';
import { JobsStore } from '../jobs/jobs.store';
import { BrowserAgentSession, applicationPlatformLabel } from '../jobs/types';
import { ProfileStore } from '../profile/profile.store';
import { SettingsStore } from '../settings/settings.store';

@Component({
  selector: 'app-yo-aplico-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './yo-aplico.page.html',
  styleUrl: './yo-aplico.page.scss',
})
export class YoAplicoPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly jobService = inject(JobService);
  private readonly jobsStore = inject(JobsStore);
  private readonly snackBar = inject(MatSnackBar);
  readonly profileStore = inject(ProfileStore);
  readonly settingsStore = inject(SettingsStore);

  readonly session = signal<BrowserAgentSession | null>(null);
  readonly starting = signal(false);
  readonly platformLabel = applicationPlatformLabel;

  start() {
    if (this.starting() || this.session()?.status === 'running') return;
    if (!this.profileStore.hasPersonalData()) {
      this.snackBar.open('Completa nombre y email en tu perfil antes de iniciar.', 'Cerrar', {
        duration: 4500,
      });
      return;
    }

    const profile = this.profileStore.snapshot();
    const settings = this.settingsStore.snapshot();
    if (!profile.targetRoles.trim() && !profile.skills.trim() && !settings.preferredTechnology) {
      this.snackBar.open('Agrega cargos objetivo o habilidades para orientar la búsqueda.', 'Cerrar', {
        duration: 4500,
      });
      return;
    }

    this.starting.set(true);
    this.jobService
      .startBrowserAgent({
        profile,
        platforms: settings.applicationPlatforms,
        preferredTechnology: settings.preferredTechnology,
        location: settings.preferredLocation || profile.location,
        min_score: settings.applicationMinScore,
        limit: 12,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.starting.set(false);
          this.session.set(session);
          this.watch(session.id);
        },
        error: (error) => {
          this.starting.set(false);
          const existing = error?.details?.session as BrowserAgentSession | undefined;
          if (existing?.id) {
            this.session.set(existing);
            this.watch(existing.id);
          }
          this.snackBar.open(error?.message ?? 'No se pudo iniciar Yo aplico.', 'Cerrar', {
            duration: 5000,
          });
        },
      });
  }

  private watch(id: string) {
    timer(0, 1500)
      .pipe(
        switchMap(() => this.jobService.getBrowserAgentStatus(id)),
        takeWhile((session) => session.status === 'running', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (session) => {
          this.session.set(session);
          if (session.status === 'completed') {
            this.jobsStore.loadJobs();
            this.snackBar.open(session.message, 'Cerrar', { duration: 6000 });
          } else if (session.status === 'failed') {
            this.snackBar.open(session.message, 'Cerrar', { duration: 6000 });
          }
        },
        error: (error) => {
          this.snackBar.open(error?.message ?? 'Se perdió la conexión con el agente.', 'Cerrar', {
            duration: 5000,
          });
        },
      });
  }
}
