import { inject, Injectable } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ChartConfiguration } from 'chart.js';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import { JobService } from './job.service';
import { Job } from './types';
import { PrepareApplicationsRequest } from './types';
import { SettingsStore } from '../settings/settings.store';

type JobsState = {
  loading: boolean;
  jobs: Job[];
  error?: string;
};

export type JobsVm = {
  loading: boolean;
  jobsCount: number;
  appliedCount: number;
  filteredJobs: Job[];
  applicationsChart: { data: any; options: ChartConfiguration['options'] };
};

@Injectable({ providedIn: 'root' })
export class JobsStore {
  private readonly jobService = inject(JobService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly initialSettings = this.settingsStore.snapshot();

  private readonly state$ = new BehaviorSubject<JobsState>({ loading: false, jobs: [] });

  readonly jobs$ = this.state$.pipe(map((s) => s.jobs));

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly techControl = new FormControl(this.initialSettings.preferredTechnology, {
    nonNullable: true,
  });
  readonly locationControl = new FormControl(this.initialSettings.preferredLocation, {
    nonNullable: true,
  });
  readonly minScoreControl = new FormControl<number | null>(this.initialSettings.minScoreDefault);
  readonly hideAppliedControl = new FormControl(this.initialSettings.hideAppliedByDefault, {
    nonNullable: true,
  });

  private readonly search$ = this.searchControl.valueChanges.pipe(
    startWith(this.searchControl.value),
    debounceTime(250),
    distinctUntilChanged(),
  );
  private readonly tech$ = this.techControl.valueChanges.pipe(
    startWith(this.techControl.value),
    distinctUntilChanged(),
  );
  private readonly location$ = this.locationControl.valueChanges.pipe(
    startWith(this.locationControl.value),
    debounceTime(150),
    distinctUntilChanged(),
  );
  private readonly minScore$ = this.minScoreControl.valueChanges.pipe(
    startWith(this.minScoreControl.value),
    distinctUntilChanged(),
  );
  private readonly hideApplied$ = this.hideAppliedControl.valueChanges.pipe(
    startWith(this.hideAppliedControl.value),
    distinctUntilChanged(),
  );

  readonly vm$ = combineLatest([
    this.state$,
    this.search$,
    this.tech$,
    this.location$,
    this.minScore$,
    this.hideApplied$,
  ]).pipe(
    map(([state, search, tech, location, minScore, hideApplied]) => {
      const jobsSorted = [...state.jobs].sort(
        (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0),
      );

      const searchNorm = search.trim().toLowerCase();
      const techNorm = tech.trim().toLowerCase();
      const locationNorm = location.trim().toLowerCase();
      const min = minScore ?? 0;

      const filteredJobs = jobsSorted.filter((j) => {
        const inSearch =
          !searchNorm ||
          j.titulo?.toLowerCase().includes(searchNorm) ||
          j.empresa?.toLowerCase().includes(searchNorm);

        const inTech =
          !techNorm ||
          (j.tecnologias ?? []).some((t) => t.toLowerCase().includes(techNorm)) ||
          j.descripcion?.toLowerCase().includes(techNorm) ||
          j.titulo?.toLowerCase().includes(techNorm);

        const inLocation = !locationNorm || j.ubicacion?.toLowerCase().includes(locationNorm);

        const inScore = (j.match_score ?? 0) >= min;

        const inApplied = !hideApplied || !j.aplicado;

        return inSearch && inTech && inLocation && inScore && inApplied;
      });

      const jobsCount = state.jobs.length;
      const appliedCount = state.jobs.filter((j) => j.aplicado).length;

      return {
        loading: state.loading,
        jobsCount,
        appliedCount,
        filteredJobs,
        applicationsChart: buildApplicationsChart(state.jobs),
      } satisfies JobsVm;
    }),
  );

  constructor() {
    this.loadJobs();
  }

  snapshot() {
    return this.state$.value;
  }

  ensureLoaded() {
    if (!this.state$.value.jobs.length && !this.state$.value.loading) this.loadJobs();
  }

  loadJobs() {
    this.state$.next({ ...this.state$.value, loading: true, error: undefined });
    this.jobService.getJobs().subscribe({
      next: (jobs) => this.state$.next({ loading: false, jobs }),
      error: (e) =>
        this.state$.next({
          loading: false,
          jobs: this.state$.value.jobs,
          error: (e as any)?.message ?? 'Error cargando trabajos',
        }),
    });
  }

  applyToJob(jobId: number) {
    return of(null).pipe(
      switchMap(() => this.jobService.apply(jobId)),
      tap(() => {
        const nextJobs = this.state$.value.jobs.map((j) =>
          j.id === jobId ? { ...j, aplicado: true } : j,
        );
        this.state$.next({ ...this.state$.value, jobs: nextJobs });
      }),
    );
  }

  prepareApplications(payload: PrepareApplicationsRequest) {
    return this.jobService.prepareApplications(payload).pipe(
      tap((response) => {
        if (!response.prepared.length) return;
        const preparedById = new Map(response.prepared.map((job) => [job.id, job]));
        const jobs = this.state$.value.jobs.map((job) => preparedById.get(job.id) ?? job);
        this.state$.next({ ...this.state$.value, jobs });
      }),
    );
  }

  scoreClass(score: number) {
    if (score > 80) return 'score--good';
    if (score >= 50) return 'score--mid';
    return 'score--low';
  }

  scoreColor(score: number): 'primary' | 'accent' | 'warn' {
    if (score > 80) return 'primary';
    if (score >= 50) return 'accent';
    return 'warn';
  }
}

function buildApplicationsChart(jobs: Job[]) {
  const labels: string[] = [];
  const values: number[] = [];

  const applied = jobs.filter((j) => j.aplicado);
  const withDate = applied.filter((j) => Boolean(j.aplicado_at));

  if (withDate.length) {
    const counts = new Map<string, number>();
    for (const job of withDate) {
      const key = String(job.aplicado_at).slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [day, count] of sorted) {
      labels.push(day);
      values.push(count);
    }
  } else {
    labels.push('Aplicaciones');
    values.push(applied.length);
  }

  const data = {
    labels,
    datasets: [
      {
        label: 'Postulaciones',
        data: values,
        backgroundColor: 'rgba(33, 150, 243, 0.35)',
        borderColor: 'rgba(33, 150, 243, 0.9)',
        borderWidth: 1,
        borderRadius: 8,
      },
    ],
  };

  const options: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true },
    },
  };

  return { data, options };
}
