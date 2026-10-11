import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { catchError, finalize, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { JobService } from '../job.service';
import { JobsStore } from '../jobs.store';
import { ProfileStore } from '../../profile/profile.store';

type GeneratorViewModel =
  | { status: 'loading' }
  | { status: 'success'; mock: boolean }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-apply-generator-page',
  imports: [
    AsyncPipe,
    RouterLink,
    ReactiveFormsModule,
    ClipboardModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './apply-generator.page.html',
  styleUrl: './apply-generator.page.scss',
})
export class ApplyGeneratorPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly jobService = inject(JobService);
  private readonly clipboard = inject(Clipboard);
  private readonly snackBar = inject(MatSnackBar);
  private readonly jobsStore = inject(JobsStore);
  readonly profileStore = inject(ProfileStore);

  readonly correoControl = new FormControl('', { nonNullable: true });
  readonly mensajeControl = new FormControl('', { nonNullable: true });
  readonly cvControl = new FormControl('', { nonNullable: true });
  readonly markingApplied = signal(false);
  private readonly retryRequest$ = new Subject<void>();

  constructor() {
    this.jobsStore.ensureLoaded();
  }

  readonly vm$ = this.route.paramMap.pipe(
    map((params) => Number(params.get('id'))),
    switchMap((jobId) =>
      this.retryRequest$.pipe(
        startWith(undefined),
        switchMap(() =>
          this.jobService
            .generate({
              job_id: jobId,
              profile: this.profileStore.snapshot(),
            })
            .pipe(
              tap((response) => {
                this.correoControl.setValue(response.correo ?? '');
                this.mensajeControl.setValue(response.mensaje_linkedin ?? '');
                this.cvControl.setValue(response.cv ?? '');
              }),
              map(
                (response) =>
                  ({ status: 'success', mock: Boolean(response.mock) }) as GeneratorViewModel,
              ),
              catchError((error) =>
                of({
                  status: 'error',
                  message: getErrorMessage(error),
                } as GeneratorViewModel),
              ),
              startWith({ status: 'loading' } as GeneratorViewModel),
            ),
        ),
      ),
    ),
  );

  copyCorreo() {
    this.copyText(this.correoControl.value, 'Correo');
  }

  copyMensaje() {
    this.copyText(this.mensajeControl.value, 'Mensaje');
  }

  copyCv() {
    this.copyText(this.cvControl.value, 'CV');
  }

  retry() {
    this.retryRequest$.next();
  }

  markApplied() {
    if (this.markingApplied()) return;
    const jobId = Number(this.route.snapshot.paramMap.get('id'));
    this.markingApplied.set(true);
    this.jobsStore
      .applyToJob(jobId)
      .pipe(finalize(() => this.markingApplied.set(false)))
      .subscribe({
        next: () => this.snackBar.open('Marcado como aplicado', 'Cerrar', { duration: 2500 }),
        error: () => undefined,
      });
  }

  openApplicationPortal() {
    const jobId = Number(this.route.snapshot.paramMap.get('id'));
    const job = this.jobsStore.snapshot().jobs.find((item) => item.id === jobId);
    if (!job?.link) {
      this.snackBar.open('La oferta no tiene un enlace válido.', 'Cerrar', { duration: 3000 });
      return;
    }
    window.open(job.link, '_blank', 'noopener');
  }

  private copyText(text: string, label: string) {
    if (!text.trim()) {
      this.snackBar.open(`No hay ${label.toLowerCase()} para copiar.`, 'Cerrar', {
        duration: 2500,
      });
      return;
    }
    const copied = this.clipboard.copy(text);
    this.snackBar.open(
      copied ? `${label} copiado` : `No se pudo copiar ${label.toLowerCase()}`,
      'Cerrar',
      {
        duration: 2500,
      },
    );
  }
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'message' in error) {
    const message = String(error.message).trim();
    if (message) return message;
  }
  return 'No se pudo generar la postulación. Revisa la configuración e inténtalo nuevamente.';
}
