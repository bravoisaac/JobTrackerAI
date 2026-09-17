import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { JobsStore } from '../jobs/jobs.store';
import type { ApplicationPlatformId } from '../jobs/types';
import { AppSettings, SettingsStore } from './settings.store';

@Component({
  selector: 'app-settings-page',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly settingsStore = inject(SettingsStore);
  private readonly jobsStore = inject(JobsStore);

  readonly form = this.fb.nonNullable.group({
    hideAppliedByDefault: this.settingsStore.snapshot().hideAppliedByDefault,
    minScoreDefault: this.settingsStore.snapshot().minScoreDefault,
    preferredTechnology: this.settingsStore.snapshot().preferredTechnology,
    preferredLocation: this.settingsStore.snapshot().preferredLocation,
    applicationPlatforms: this.fb.nonNullable.control<ApplicationPlatformId[]>(
      this.settingsStore.snapshot().applicationPlatforms,
    ),
    applicationMinScore: this.settingsStore.snapshot().applicationMinScore,
  });

  save() {
    const settings = this.form.getRawValue() as AppSettings;
    this.settingsStore.save(settings);
    this.applyToCurrentFilters(this.settingsStore.snapshot());
    this.snackBar.open('Configuración guardada', 'Cerrar', { duration: 2500 });
  }

  reset() {
    this.settingsStore.reset();
    this.form.reset(this.settingsStore.snapshot());
    this.applyToCurrentFilters(this.settingsStore.snapshot());
    this.snackBar.open('Configuración restablecida', 'Cerrar', { duration: 2500 });
  }

  private applyToCurrentFilters(settings: AppSettings) {
    this.jobsStore.hideAppliedControl.setValue(settings.hideAppliedByDefault);
    this.jobsStore.minScoreControl.setValue(settings.minScoreDefault);
    this.jobsStore.techControl.setValue(settings.preferredTechnology);
    this.jobsStore.locationControl.setValue(settings.preferredLocation);
  }
}
