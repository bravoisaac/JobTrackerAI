import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { CandidateProfile, ProfileStore } from './profile.store';

@Component({
  selector: 'app-profile-page',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  readonly profileStore = inject(ProfileStore);
  private readonly initialProfile = this.profileStore.snapshot();

  readonly form = this.fb.nonNullable.group({
    fullName: [this.initialProfile.fullName, [Validators.required, Validators.maxLength(160)]],
    email: [
      this.initialProfile.email,
      [Validators.required, Validators.email, Validators.maxLength(320)],
    ],
    phone: [this.initialProfile.phone, [Validators.maxLength(80)]],
    location: [this.initialProfile.location, [Validators.maxLength(240)]],
    linkedin: [this.initialProfile.linkedin, [Validators.maxLength(500)]],
    portfolio: [this.initialProfile.portfolio, [Validators.maxLength(500)]],
    summary: [this.initialProfile.summary, [Validators.maxLength(4000)]],
    targetRoles: [this.initialProfile.targetRoles, [Validators.maxLength(1000)]],
    skills: [this.initialProfile.skills, [Validators.maxLength(4000)]],
    experience: [this.initialProfile.experience, [Validators.maxLength(12_000)]],
    education: [this.initialProfile.education, [Validators.maxLength(4000)]],
    languages: [this.initialProfile.languages, [Validators.maxLength(1000)]],
    cvFileName: [this.initialProfile.cvFileName, [Validators.maxLength(260)]],
    cvText: [this.initialProfile.cvText, [Validators.maxLength(24_000)]],
  });

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Revisa el nombre y escribe un email válido.', 'Cerrar', {
        duration: 3500,
      });
      return;
    }
    this.profileStore.save(this.form.getRawValue() as CandidateProfile);
    this.snackBar.open('Perfil guardado para generar postulaciones IA', 'Cerrar', {
      duration: 2800,
    });
  }

  clear() {
    this.profileStore.clear();
    this.form.reset(this.profileStore.snapshot());
    this.snackBar.open('Perfil limpiado', 'Cerrar', { duration: 2200 });
  }

  onCvSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.snackBar.open('El CV no puede superar 5 MB.', 'Cerrar', { duration: 3500 });
      input.value = '';
      return;
    }

    this.form.controls.cvFileName.setValue(file.name);

    const lowerName = file.name.toLowerCase();
    const canReadAsText =
      file.type.startsWith('text/') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.csv');

    if (!canReadAsText) {
      this.snackBar.open(
        'CV adjuntado. Para PDF/DOCX pega el texto del CV en el campo inferior.',
        'Cerrar',
        { duration: 4500 },
      );
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.form.controls.cvText.setValue(String(reader.result ?? ''));
      this.snackBar.open('CV cargado como texto editable', 'Cerrar', { duration: 3000 });
    };
    reader.onerror = () => {
      this.snackBar.open('No se pudo leer el archivo CV', 'Cerrar', { duration: 3000 });
    };
    reader.readAsText(file);
    input.value = '';
  }
}
