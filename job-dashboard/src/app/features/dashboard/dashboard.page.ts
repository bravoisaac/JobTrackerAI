import { AsyncPipe, PercentPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';

import { JobsStore } from '../jobs/jobs.store';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    AsyncPipe,
    PercentPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    BaseChartDirective,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPageComponent {
  private readonly jobsStore = inject(JobsStore);

  readonly vm$ = this.jobsStore.vm$;
}
