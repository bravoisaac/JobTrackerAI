import { AsyncPipe, DatePipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { JobsStore } from '../jobs/jobs.store';
import { applicationPlatformLabel, Job } from '../jobs/types';

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
  readonly jobsStore = inject(JobsStore);
  readonly platformLabel = applicationPlatformLabel;

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
}

function dateValue(value?: string) {
  return value ? new Date(value).getTime() || 0 : 0;
}
