import { AsyncPipe, NgClass } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { JobsStore } from '../jobs.store';
import { DiscoverJobsDialogComponent } from '../components/discover-jobs.dialog';
import { ProfileStore } from '../../profile/profile.store';
import { SettingsStore } from '../../settings/settings.store';
import { applicationPlatformLabel } from '../types';

@Component({
  selector: 'app-jobs-list-page',
  imports: [
    AsyncPipe,
    NgClass,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './jobs-list.page.html',
  styleUrl: './jobs-list.page.scss',
})
export class JobsListPageComponent {
  readonly jobsStore = inject(JobsStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly profileStore = inject(ProfileStore);
  private readonly settingsStore = inject(SettingsStore);

  readonly vm$ = this.jobsStore.vm$;
  readonly skeleton = Array.from({ length: 6 }, (_, i) => i);
  readonly preparing = signal(false);
  readonly platformLabel = applicationPlatformLabel;
  constructor() {}

  toggleHideApplied() {
    const next = !this.jobsStore.hideAppliedControl.value;
    this.jobsStore.hideAppliedControl.setValue(next);
  }

  discoverWithAi() {
    const ref = this.dialog.open(DiscoverJobsDialogComponent, {
      autoFocus: false,
      width: 'min(980px, 96vw)',
      maxWidth: '96vw',
      maxHeight: '90vh',
    });
    ref.afterClosed().subscribe((result) => {
      if (result?.imported) this.jobsStore.loadJobs();
    });
  }

  prepareSelectedApplications() {
    if (!this.profileStore.hasPersonalData()) {
      this.snackBar.open(
        'Completa nombre y email en tu perfil antes de preparar postulaciones.',
        'Cerrar',
        {
          duration: 4000,
        },
      );
      return;
    }

    const settings = this.settingsStore.snapshot();
    this.preparing.set(true);
    this.jobsStore
      .prepareApplications({
        platforms: settings.applicationPlatforms,
        min_score: settings.applicationMinScore,
        limit: 10,
        profile: this.profileStore.snapshot(),
      })
      .subscribe({
        next: (response) => {
          this.preparing.set(false);
          this.snackBar.open(response.message, 'Cerrar', { duration: 4500 });
        },
        error: (error) => {
          this.preparing.set(false);
          this.snackBar.open(error?.message ?? 'No se pudo preparar la cola.', 'Cerrar', {
            duration: 4500,
          });
        },
      });
  }
}
