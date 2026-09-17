import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { map, switchMap } from 'rxjs';

import { JobService } from '../job.service';
import { JobsStore } from '../jobs.store';
import { ProfileStore } from '../../profile/profile.store';

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

  constructor() {
    this.jobsStore.ensureLoaded();
  }

  readonly vm$ = this.route.paramMap.pipe(
    map((params) => Number(params.get('id'))),
    switchMap((jobId) =>
      this.jobService.generate({
        job_id: jobId,
        profile: this.profileStore.snapshot(),
      }),
    ),
    map((res) => {
      this.correoControl.setValue(res.correo ?? '');
      this.mensajeControl.setValue(res.mensaje_linkedin ?? '');
      this.cvControl.setValue(res.cv ?? '');
      return res;
    }),
  );

  copyCorreo() {
    const text = this.correoControl.value;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
    else this.clipboard.copy(text);
    this.snackBar.open('Correo copiado', 'Cerrar', { duration: 2000 });
  }

  copyMensaje() {
    const text = this.mensajeControl.value;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
    else this.clipboard.copy(text);
    this.snackBar.open('Mensaje copiado', 'Cerrar', { duration: 2000 });
  }

  copyCv() {
    const text = this.cvControl.value;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
    else this.clipboard.copy(text);
    this.snackBar.open('CV copiado', 'Cerrar', { duration: 2000 });
  }

  markApplied() {
    const jobId = Number(this.route.snapshot.paramMap.get('id'));
    this.jobsStore.applyToJob(jobId).subscribe({
      next: () => this.snackBar.open('Marcado como aplicado', 'Cerrar', { duration: 2500 }),
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
}
