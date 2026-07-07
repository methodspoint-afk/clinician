import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, SqlJsAdapter } from './database';
import {
  applicationsRepo,
  methodsRepo,
  normsRepo,
  resultsRepo,
  settingsRepo,
  subjectsRepo,
  usersRepo,
} from './repositories';
import { DEFAULT_SCORING_CONFIG } from '../domain/normSelection/score';
import { Norm, User } from '../domain/types';

let db: SqlJsAdapter;
let owner: User;
let researcher: User;

function baseNorm(overrides: Partial<Norm> = {}): Norm {
  return {
    normId: normsRepo.newNormId(),
    version: 1,
    sourceRef: 'Пушкина Т.П., Пушкина А.В. Клиническая психология',
    sourceType: 'methodical_guide',
    validationStatus: 'draft',
    methodId: 'schulte',
    metric: 'ER',
    procedureMatch: 'full',
    ageMin: 18,
    ageMax: 45,
    educationLevel: 'not_stratified',
    language: 'ru',
    clinicalStatus: 'healthy',
    cellN: 120,
    statForm: 'mean_sd',
    mean: 45,
    sd: 10,
    isSkewed: true,
    higherIsWorse: true,
    dataCollectionYear: 2015,
    stratifiedBy: ['age'],
    flags: [],
    active: true,
    appliedCount: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  db = await SqlJsAdapter.open();
  await migrate(db);
  await methodsRepo.seedIfEmpty(db);
  owner = await usersRepo.create(db, 'Степан', 'owner');
  researcher = await usersRepo.create(db, 'Коллега', 'researcher');
});

describe('Миграции и seed', () => {
  it('7 предустановленных методик на месте', async () => {
    const methods = await methodsRepo.list(db);
    expect(methods.map((m) => m.methodId).sort()).toEqual([
      'concept_comparison',
      'correction_test',
      'digit_span',
      'pictogram',
      'schulte',
      'ten_words',
      'visual_spatial_memory',
    ]);
  });

  it('повторная миграция и досев не ломают БД', async () => {
    await migrate(db);
    await methodsRepo.seedIfEmpty(db);
    const methods = await methodsRepo.list(db);
    expect(methods).toHaveLength(7);
  });

  it('досев добавляет отсутствующие методики, не трогая существующие', async () => {
    // Имитация старой БД: специалист переименовал Шульте, новых методик ещё нет
    await db.run("UPDATE methods SET name = 'Шульте (правка специалиста)' WHERE method_id = 'schulte'");
    await db.run("DELETE FROM methods WHERE method_id IN ('digit_span','pictogram','concept_comparison')");
    await methodsRepo.seedIfEmpty(db);
    const methods = await methodsRepo.list(db);
    expect(methods).toHaveLength(7);
    expect(methods.find((m) => m.methodId === 'schulte')!.name).toBe('Шульте (правка специалиста)');
  });

  it('v2: препараты и комментарий сохраняются в карточке испытуемого', async () => {
    const s = await subjectsRepo.create(db, {
      age: 34,
      education: 'higher',
      medications: 'галоперидол 5 мг/сут',
      comment: 'билингв',
      createdBy: owner.userId,
    });
    const [loaded] = await subjectsRepo.listVisible(db, owner);
    expect(loaded.subjectCode).toBe(s.subjectCode);
    expect(loaded.medications).toBe('галоперидол 5 мг/сут');
    expect(loaded.comment).toBe('билингв');
  });
});

describe('Испытуемые', () => {
  it('коды PSY-ГГГГ-XXXX генерируются последовательно и уникально', async () => {
    const year = new Date().getFullYear();
    const s1 = await subjectsRepo.create(db, { age: 34, education: 'higher', createdBy: researcher.userId });
    const s2 = await subjectsRepo.create(db, { age: 60, education: 'secondary', createdBy: researcher.userId });
    expect(s1.subjectCode).toBe(`PSY-${year}-0001`);
    expect(s2.subjectCode).toBe(`PSY-${year}-0002`);
  });

  it('researcher видит только своих, owner — всех', async () => {
    await subjectsRepo.create(db, { age: 30, education: 'higher', createdBy: researcher.userId });
    await subjectsRepo.create(db, { age: 40, education: 'higher', createdBy: owner.userId });
    expect(await subjectsRepo.listVisible(db, researcher)).toHaveLength(1);
    expect(await subjectsRepo.listVisible(db, owner)).toHaveLength(2);
  });
});

describe('Нормы', () => {
  it('сохранение пересчитывает кэш качества (score/tier/флаги)', async () => {
    const saved = await normsRepo.save(db, baseNorm(), DEFAULT_SCORING_CONFIG);
    expect(saved.qualityScore).toBeGreaterThan(0);
    expect(saved.qualityTier).toBeDefined();
    expect(saved.flags).toContain('skewed_distribution');
    const all = await normsRepo.listAll(db);
    expect(all).toHaveLength(1);
    expect(all[0].qualityScore).toBe(saved.qualityScore);
  });

  it('новая версия: старая деактивируется и не удаляется', async () => {
    const v1 = await normsRepo.save(
      db,
      baseNorm({ validationStatus: 'validated' }),
      DEFAULT_SCORING_CONFIG,
    );
    const v2 = await normsRepo.newVersion(db, v1, DEFAULT_SCORING_CONFIG);
    expect(v2.version).toBe(2);
    expect(v2.validationStatus).toBe('draft');
    const all = await normsRepo.listAll(db);
    expect(all).toHaveLength(2);
    const old = all.find((n) => n.version === 1)!;
    expect(old.active).toBe(false);
    // кандидаты для подбора — только последняя версия
    const candidates = await normsRepo.candidatesForMethod(db, 'schulte');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].version).toBe(2);
  });

  it('стартовая база норм (бэкап клинициста) досевается и валидна для подбора', async () => {
    await normsRepo.seedIfEmpty(db);
    const all = await normsRepo.listAll(db);
    expect(all).toHaveLength(7);
    // все валидированы и активны → сразу участвуют в подборе
    expect(all.every((n) => n.validationStatus === 'validated' && n.active)).toBe(true);
    // Шульте: ЭР, ПУ, ВР
    const schulte = await normsRepo.candidatesForMethod(db, 'schulte');
    expect(schulte.map((n) => n.metric).sort()).toEqual(['ER', 'PU', 'VR']);
    // балл пересчитан по актуальной схеме (не взят из бэкапа)
    expect(all.every((n) => (n.qualityScore ?? 0) > 0)).toBe(true);
  });

  it('повторный досев норм идемпотентен (по normId)', async () => {
    await normsRepo.seedIfEmpty(db);
    await normsRepo.seedIfEmpty(db);
    expect(await normsRepo.listAll(db)).toHaveLength(7);
  });
});

describe('Результаты и лог применения', () => {
  it('применение нормы логируется и увеличивает applied_count', async () => {
    const norm = await normsRepo.save(
      db,
      baseNorm({ validationStatus: 'validated' }),
      DEFAULT_SCORING_CONFIG,
    );
    const subject = await subjectsRepo.create(db, {
      age: 34,
      education: 'higher',
      createdBy: researcher.userId,
    });
    const result = await resultsRepo.create(db, {
      subjectCode: subject.subjectCode,
      methodId: 'schulte',
      rawMeasures: { t1: 45, t2: 50, t3: 40, t4: 55, t5: 60 },
      derived: { ER: 50, VR: 0.9, PU: 1.1 },
      shareConsent: false,
      createdBy: researcher.userId,
    });
    await applicationsRepo.create(db, {
      resultId: result.resultId,
      normId: norm.normId,
      normVersion: norm.version,
      metric: 'ER',
      patientDemographics: { age: 34, education: 'higher', language: 'ru' },
      rawValue: 50,
      computedDeviation: { kind: 'z', value: 0.5, text: 'z = +0.5; в пределах нормы (< 1 σ).' },
      wasDefault: true,
      clinicianConfirmed: true,
      isOverride: false,
      appliedBy: researcher.userId,
    });

    const apps = await applicationsRepo.listForResult(db, result.resultId);
    expect(apps).toHaveLength(1);
    expect(apps[0].normId).toBe(norm.normId);
    expect(apps[0].patientDemographics.age).toBe(34);
    const [updated] = await normsRepo.listAll(db);
    expect(updated.appliedCount).toBe(1);
  });
});

describe('Настройки и бэкап', () => {
  it('веса скоринга сохраняются и читаются', async () => {
    const cfg = { ...DEFAULT_SCORING_CONFIG, tieBreakerDelta: 3 };
    await settingsRepo.setScoring(db, cfg);
    const loaded = await settingsRepo.getScoring(db);
    expect(loaded.tieBreakerDelta).toBe(3);
  });

  it('экспорт и восстановление БД из снимка', async () => {
    await subjectsRepo.create(db, { age: 34, education: 'higher', createdBy: researcher.userId });
    const bytes = await db.exportBytes();
    const restored = await SqlJsAdapter.open({ initialBytes: bytes });
    const rows = await restored.select('SELECT * FROM subjects');
    expect(rows).toHaveLength(1);
  });
});
