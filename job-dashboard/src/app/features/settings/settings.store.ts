import { Injectable, signal } from '@angular/core';
import type { ApplicationPlatformId } from '../jobs/types';

const STORAGE_KEY = 'job-dashboard.settings.v1';

export interface AppSettings {
  hideAppliedByDefault: boolean;
  minScoreDefault: number;
  preferredTechnology: string;
  preferredLocation: string;
  applicationPlatforms: ApplicationPlatformId[];
  applicationMinScore: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hideAppliedByDefault: true,
  minScoreDefault: 0,
  preferredTechnology: '',
  preferredLocation: '',
  applicationPlatforms: ['linkedin', 'computrabajo'],
  applicationMinScore: 70,
};

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  readonly settings = signal<AppSettings>(this.load());

  snapshot() {
    return this.settings();
  }

  save(settings: AppSettings) {
    const cleanSettings = normalizeSettings(settings);
    this.settings.set(cleanSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanSettings));
  }

  reset() {
    this.settings.set(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }

  private load(): AppSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const minScore = Number(settings.minScoreDefault ?? 0);
  const applicationMinScore = Number(settings.applicationMinScore ?? 70);
  const validPlatforms = new Set<ApplicationPlatformId>(['linkedin', 'computrabajo', 'external']);
  const applicationPlatforms = Array.isArray(settings.applicationPlatforms)
    ? settings.applicationPlatforms.filter((id): id is ApplicationPlatformId =>
        validPlatforms.has(id),
      )
    : DEFAULT_SETTINGS.applicationPlatforms;
  return {
    hideAppliedByDefault: Boolean(settings.hideAppliedByDefault),
    minScoreDefault: Math.max(0, Math.min(100, Number.isFinite(minScore) ? minScore : 0)),
    preferredTechnology: String(settings.preferredTechnology ?? '').trim(),
    preferredLocation: String(settings.preferredLocation ?? '').trim(),
    applicationPlatforms: applicationPlatforms.length
      ? [...new Set(applicationPlatforms)]
      : DEFAULT_SETTINGS.applicationPlatforms,
    applicationMinScore: Math.max(
      0,
      Math.min(100, Number.isFinite(applicationMinScore) ? applicationMinScore : 70),
    ),
  };
}
