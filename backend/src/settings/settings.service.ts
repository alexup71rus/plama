import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsEntity } from './settings.entity';
import { DEFAULT_SETTINGS } from '../types/settings';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SettingsEntity)
    private settingsRepository: Repository<SettingsEntity>,
  ) {}

  async getSettings(): Promise<SettingsEntity> {
    let settings = await this.settingsRepository.findOne({ where: { id: 1 } });
    if (!settings) {
      settings = this.settingsRepository.create({
        id: 1,
        settings: DEFAULT_SETTINGS,
      });
      await this.settingsRepository.save(settings);
      return settings;
    }

    // Backward-compat: older persisted settings may miss newly introduced keys.
    // Merge with defaults so GraphQL non-nullable fields are always present.
    const merged = { ...DEFAULT_SETTINGS, ...(settings.settings as any) };
    if (JSON.stringify(merged) !== JSON.stringify(settings.settings)) {
      settings.settings = merged as any;
      await this.settingsRepository.save(settings);
    }
    return settings;
  }

  async saveSettings(
    settings: typeof DEFAULT_SETTINGS,
  ): Promise<SettingsEntity> {
    let entity = await this.settingsRepository.findOne({ where: { id: 1 } });
    if (!entity) {
      entity = this.settingsRepository.create({ id: 1, settings });
    } else {
      entity.settings = settings;
    }
    return this.settingsRepository.save(entity);
  }

  async resetSettings(): Promise<SettingsEntity> {
    let entity = await this.settingsRepository.findOne({ where: { id: 1 } });
    if (!entity) {
      entity = this.settingsRepository.create({
        id: 1,
        settings: DEFAULT_SETTINGS,
      });
    } else {
      entity.settings = DEFAULT_SETTINGS;
    }
    return this.settingsRepository.save(entity);
  }
}
