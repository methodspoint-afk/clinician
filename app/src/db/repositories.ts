import { SqlDatabase } from './database';
import {
  Deviation,
  Method,
  MethodConfig,
  Norm,
  NormApplication,
  Subject,
  TestResult,
  User,
} from '../domain/types';
import { DEFAULT_SCORING_CONFIG, ScoringConfig, computeQuality } from '../domain/normSelection/score';
import { SEED_METHODS } from '../domain/seedMethods';
import { SEED_NORMS } from '../domain/seedNorms';

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const nowIso = () => new Date().toISOString();

// ---------- users ----------

export const usersRepo = {
  async list(db: SqlDatabase): Promise<User[]> {
    const rows = await db.select<{ user_id: string; display_name: string; role: User['role'] }>(
      'SELECT * FROM users ORDER BY created_at',
    );
    return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, role: r.role }));
  },

  async create(db: SqlDatabase, displayName: string, role: User['role']): Promise<User> {
    const user: User = { userId: uid('u'), displayName, role };
    await db.run('INSERT INTO users (user_id, display_name, role, created_at) VALUES (?,?,?,?)', [
      user.userId,
      displayName,
      role,
      nowIso(),
    ]);
    return user;
  },
};

// ---------- methods ----------

export const methodsRepo = {
  async list(db: SqlDatabase): Promise<Method[]> {
    const rows = await db.select<{
      method_id: string;
      name: string;
      measure_type: Method['measureType'];
      config: string;
      is_active: number;
    }>('SELECT * FROM methods ORDER BY name');
    return rows.map((r) => ({
      methodId: r.method_id,
      name: r.name,
      measureType: r.measure_type,
      config: JSON.parse(r.config) as MethodConfig,
      isActive: !!r.is_active,
    }));
  },

  async upsert(db: SqlDatabase, method: Method): Promise<void> {
    await db.run(
      `INSERT INTO methods (method_id, name, measure_type, config, is_active)
       VALUES (?,?,?,?,?)
       ON CONFLICT(method_id) DO UPDATE SET
         name=excluded.name, measure_type=excluded.measure_type,
         config=excluded.config, is_active=excluded.is_active`,
      [method.methodId, method.name, method.measureType, JSON.stringify(method.config), method.isActive ? 1 : 0],
    );
  },

  /** Досев: добавляет отсутствующие предустановленные методики, существующие не трогает */
  async seedIfEmpty(db: SqlDatabase): Promise<void> {
    const rows = await db.select<{ method_id: string }>('SELECT method_id FROM methods');
    const existing = new Set(rows.map((r) => r.method_id));
    for (const m of SEED_METHODS) {
      if (!existing.has(m.methodId)) await methodsRepo.upsert(db, m);
    }
  },
};

// ---------- subjects ----------

export const subjectsRepo = {
  /** Автогенерация кода PSY-ГГГГ-XXXX: последовательный номер в текущем году */
  async nextCode(db: SqlDatabase): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PSY-${year}-`;
    const rows = await db.select<{ subject_code: string }>(
      'SELECT subject_code FROM subjects WHERE subject_code LIKE ? ORDER BY subject_code DESC LIMIT 1',
      [`${prefix}%`],
    );
    const last = rows[0] ? Number(rows[0].subject_code.slice(prefix.length)) : 0;
    return `${prefix}${String(last + 1).padStart(4, '0')}`;
  },

  async create(
    db: SqlDatabase,
    data: Omit<Subject, 'subjectCode' | 'createdAt'>,
  ): Promise<Subject> {
    const subject: Subject = {
      ...data,
      subjectCode: await subjectsRepo.nextCode(db),
      createdAt: nowIso(),
    };
    await db.run(
      'INSERT INTO subjects (subject_code, age, education, sex, diagnosis, medications, comment, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        subject.subjectCode,
        subject.age,
        subject.education,
        subject.sex ?? null,
        subject.diagnosis ?? null,
        subject.medications ?? null,
        subject.comment ?? null,
        subject.createdBy,
        subject.createdAt,
      ],
    );
    return subject;
  },

  /** Owner видит всех; Researcher — только своих */
  async listVisible(db: SqlDatabase, user: User): Promise<Subject[]> {
    const where = user.role === 'owner' ? '' : 'WHERE created_by = ?';
    const rows = await db.select<{
      subject_code: string;
      age: number;
      education: Subject['education'];
      sex: Subject['sex'] | null;
      diagnosis: string | null;
      medications: string | null;
      comment: string | null;
      created_by: string;
      created_at: string;
    }>(`SELECT * FROM subjects ${where} ORDER BY created_at DESC`, user.role === 'owner' ? [] : [user.userId]);
    return rows.map((r) => ({
      subjectCode: r.subject_code,
      age: r.age,
      education: r.education,
      sex: r.sex ?? undefined,
      diagnosis: r.diagnosis ?? undefined,
      medications: r.medications ?? undefined,
      comment: r.comment ?? undefined,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  },
};

// ---------- norms ----------

interface NormRow {
  [key: string]: unknown;
}

function normFromRow(r: NormRow): Norm {
  return {
    normId: r.norm_id as string,
    version: r.version as number,
    sourceRef: r.source_ref as string,
    sourceType: r.source_type as Norm['sourceType'],
    enteredBy: (r.entered_by as string) ?? undefined,
    enteredAt: (r.entered_at as string) ?? undefined,
    validatedBy: (r.validated_by as string) ?? undefined,
    validatedAt: (r.validated_at as string) ?? undefined,
    validationStatus: r.validation_status as Norm['validationStatus'],
    methodId: r.method_id as string,
    methodVariant: (r.method_variant as string) ?? undefined,
    metric: r.metric as string,
    procedureMatch: r.procedure_match as Norm['procedureMatch'],
    procedureNotes: (r.procedure_notes as string) ?? undefined,
    ageMin: r.age_min as number,
    ageMax: r.age_max as number,
    educationLevel: r.education_level as Norm['educationLevel'],
    sex: (r.sex as Norm['sex']) ?? undefined,
    language: r.language as string,
    cultureRegion: (r.culture_region as string) ?? undefined,
    clinicalStatus: r.clinical_status as Norm['clinicalStatus'],
    cellN: r.cell_n as number,
    totalStudyN: (r.total_study_n as number) ?? undefined,
    statForm: r.stat_form as Norm['statForm'],
    mean: (r.mean as number) ?? undefined,
    sd: (r.sd as number) ?? undefined,
    percentiles: r.percentiles ? (JSON.parse(r.percentiles as string) as Record<string, number>) : undefined,
    distributionNote: (r.distribution_note as string) ?? undefined,
    isSkewed: !!r.is_skewed,
    higherIsWorse: !!r.higher_is_worse,
    dataCollectionYear: (r.data_collection_year as number) ?? undefined,
    publicationYear: (r.publication_year as number) ?? undefined,
    stratifiedBy: JSON.parse((r.stratified_by as string) || '[]') as string[],
    peerReviewed: r.peer_reviewed == null ? undefined : !!r.peer_reviewed,
    qualityScore: (r.quality_score as number) ?? undefined,
    qualityTier: (r.quality_tier as Norm['qualityTier']) ?? undefined,
    flags: JSON.parse((r.flags as string) || '[]') as Norm['flags'],
    supersedes: (r.supersedes as string) ?? undefined,
    active: !!r.active,
    appliedCount: (r.applied_count as number) ?? 0,
  };
}

export const normsRepo = {
  async listAll(db: SqlDatabase): Promise<Norm[]> {
    const rows = await db.select<NormRow>('SELECT * FROM norms ORDER BY method_id, metric, norm_id, version DESC');
    return rows.map(normFromRow);
  },

  /** Кандидаты для подбора: последняя активная версия каждой нормы методики */
  async candidatesForMethod(db: SqlDatabase, methodId: string): Promise<Norm[]> {
    const rows = await db.select<NormRow>(
      `SELECT n.* FROM norms n
       INNER JOIN (SELECT norm_id, MAX(version) AS v FROM norms GROUP BY norm_id) latest
         ON latest.norm_id = n.norm_id AND latest.v = n.version
       WHERE n.method_id = ?`,
      [methodId],
    );
    return rows.map(normFromRow);
  },

  /** Сохранение с пересчётом кэша качества (score/tier/флаги) */
  async save(db: SqlDatabase, norm: Norm, scoring: ScoringConfig): Promise<Norm> {
    const q = computeQuality(norm, scoring);
    const withQuality: Norm = { ...norm, qualityScore: q.total, qualityTier: q.tier, flags: q.flags };
    await db.run(
      `INSERT INTO norms (
        norm_id, version, source_ref, source_type, entered_by, entered_at,
        validated_by, validated_at, validation_status, method_id, method_variant,
        metric, procedure_match, procedure_notes, age_min, age_max, education_level,
        sex, language, culture_region, clinical_status, cell_n, total_study_n,
        stat_form, mean, sd, percentiles, distribution_note, is_skewed, higher_is_worse,
        data_collection_year, publication_year, stratified_by, peer_reviewed,
        quality_score, quality_tier, flags, supersedes, active, applied_count
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(norm_id, version) DO UPDATE SET
        source_ref=excluded.source_ref, source_type=excluded.source_type,
        validated_by=excluded.validated_by, validated_at=excluded.validated_at,
        validation_status=excluded.validation_status, method_id=excluded.method_id,
        method_variant=excluded.method_variant, metric=excluded.metric,
        procedure_match=excluded.procedure_match, procedure_notes=excluded.procedure_notes,
        age_min=excluded.age_min, age_max=excluded.age_max,
        education_level=excluded.education_level, sex=excluded.sex,
        language=excluded.language, culture_region=excluded.culture_region,
        clinical_status=excluded.clinical_status, cell_n=excluded.cell_n,
        total_study_n=excluded.total_study_n, stat_form=excluded.stat_form,
        mean=excluded.mean, sd=excluded.sd, percentiles=excluded.percentiles,
        distribution_note=excluded.distribution_note, is_skewed=excluded.is_skewed,
        higher_is_worse=excluded.higher_is_worse,
        data_collection_year=excluded.data_collection_year,
        publication_year=excluded.publication_year, stratified_by=excluded.stratified_by,
        peer_reviewed=excluded.peer_reviewed, quality_score=excluded.quality_score,
        quality_tier=excluded.quality_tier, flags=excluded.flags,
        supersedes=excluded.supersedes, active=excluded.active`,
      [
        withQuality.normId,
        withQuality.version,
        withQuality.sourceRef,
        withQuality.sourceType,
        withQuality.enteredBy ?? null,
        withQuality.enteredAt ?? null,
        withQuality.validatedBy ?? null,
        withQuality.validatedAt ?? null,
        withQuality.validationStatus,
        withQuality.methodId,
        withQuality.methodVariant ?? null,
        withQuality.metric,
        withQuality.procedureMatch,
        withQuality.procedureNotes ?? null,
        withQuality.ageMin,
        withQuality.ageMax,
        withQuality.educationLevel,
        withQuality.sex ?? null,
        withQuality.language,
        withQuality.cultureRegion ?? null,
        withQuality.clinicalStatus,
        withQuality.cellN,
        withQuality.totalStudyN ?? null,
        withQuality.statForm,
        withQuality.mean ?? null,
        withQuality.sd ?? null,
        withQuality.percentiles ? JSON.stringify(withQuality.percentiles) : null,
        withQuality.distributionNote ?? null,
        withQuality.isSkewed ? 1 : 0,
        withQuality.higherIsWorse ? 1 : 0,
        withQuality.dataCollectionYear ?? null,
        withQuality.publicationYear ?? null,
        JSON.stringify(withQuality.stratifiedBy),
        withQuality.peerReviewed == null ? null : withQuality.peerReviewed ? 1 : 0,
        withQuality.qualityScore ?? null,
        withQuality.qualityTier ?? null,
        JSON.stringify(withQuality.flags),
        withQuality.supersedes ?? null,
        withQuality.active ? 1 : 0,
        withQuality.appliedCount,
      ],
    );
    return withQuality;
  },

  newNormId(): string {
    return uid('norm');
  },

  /** Досев стартовой базы норм: добавляет отсутствующие, существующие не трогает */
  async seedIfEmpty(db: SqlDatabase, scoring: ScoringConfig = DEFAULT_SCORING_CONFIG): Promise<void> {
    const rows = await db.select<{ norm_id: string }>('SELECT norm_id FROM norms');
    const existing = new Set(rows.map((r) => r.norm_id));
    for (const n of SEED_NORMS) {
      if (!existing.has(n.normId)) await normsRepo.save(db, n, scoring);
    }
  },

  /** Новая версия: старая остаётся в истории (supersedes), активной становится новая */
  async newVersion(db: SqlDatabase, current: Norm, scoring: ScoringConfig): Promise<Norm> {
    const next: Norm = {
      ...current,
      version: current.version + 1,
      validationStatus: 'draft',
      validatedBy: undefined,
      validatedAt: undefined,
      supersedes: `${current.normId}:v${current.version}`,
      appliedCount: 0,
    };
    await db.run('UPDATE norms SET active = 0 WHERE norm_id = ? AND version = ?', [
      current.normId,
      current.version,
    ]);
    return normsRepo.save(db, { ...next, active: true }, scoring);
  },

  async incrementApplied(db: SqlDatabase, normId: string, version: number): Promise<void> {
    await db.run('UPDATE norms SET applied_count = applied_count + 1 WHERE norm_id = ? AND version = ?', [
      normId,
      version,
    ]);
  },
};

// ---------- test results & applications ----------

export const resultsRepo = {
  async create(
    db: SqlDatabase,
    data: Omit<TestResult, 'resultId' | 'createdAt'>,
  ): Promise<TestResult> {
    const result: TestResult = { ...data, resultId: uid('res'), createdAt: nowIso() };
    await db.run(
      `INSERT INTO test_results (result_id, subject_code, method_id, raw_measures, derived,
        qualitative, interpretation, share_consent, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        result.resultId,
        result.subjectCode,
        result.methodId,
        JSON.stringify(result.rawMeasures),
        JSON.stringify(result.derived),
        result.qualitativeRows && result.qualitativeRows.length ? JSON.stringify(result.qualitativeRows) : null,
        result.interpretation ?? null,
        result.shareConsent ? 1 : 0,
        result.createdBy,
        result.createdAt,
      ],
    );
    return result;
  },

  async listForSubject(db: SqlDatabase, subjectCode: string): Promise<TestResult[]> {
    const rows = await db.select<TestResultRow>(
      'SELECT * FROM test_results WHERE subject_code = ? ORDER BY created_at DESC',
      [subjectCode],
    );
    return rows.map(testResultFromRow);
  },

  /** Все результаты (для экспорта слепков; owner-функция) */
  async listAll(db: SqlDatabase): Promise<TestResult[]> {
    const rows = await db.select<TestResultRow>('SELECT * FROM test_results ORDER BY created_at DESC');
    return rows.map(testResultFromRow);
  },
};

interface TestResultRow {
  result_id: string;
  subject_code: string;
  method_id: string;
  raw_measures: string;
  derived: string;
  qualitative: string | null;
  interpretation: string | null;
  share_consent: number;
  created_by: string;
  created_at: string;
}

function testResultFromRow(r: TestResultRow): TestResult {
  return {
    resultId: r.result_id,
    subjectCode: r.subject_code,
    methodId: r.method_id,
    rawMeasures: JSON.parse(r.raw_measures),
    derived: JSON.parse(r.derived),
    qualitativeRows: r.qualitative ? JSON.parse(r.qualitative) : undefined,
    interpretation: r.interpretation ?? undefined,
    shareConsent: !!r.share_consent,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export const applicationsRepo = {
  async create(
    db: SqlDatabase,
    data: Omit<NormApplication, 'applicationId' | 'appliedAt'>,
  ): Promise<NormApplication> {
    const app: NormApplication = { ...data, applicationId: uid('app'), appliedAt: nowIso() };
    await db.run(
      `INSERT INTO norm_applications (application_id, result_id, norm_id, norm_version, metric,
        patient_demographics, raw_value, computed_deviation, system_suggestion,
        was_default, clinician_confirmed, is_override, override_reason, applied_by, applied_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        app.applicationId,
        app.resultId,
        app.normId,
        app.normVersion,
        app.metric,
        JSON.stringify(app.patientDemographics),
        app.rawValue,
        JSON.stringify(app.computedDeviation),
        app.systemSuggestion ?? null,
        app.wasDefault ? 1 : 0,
        app.clinicianConfirmed ? 1 : 0,
        app.isOverride ? 1 : 0,
        app.overrideReason ?? null,
        app.appliedBy,
        app.appliedAt,
      ],
    );
    await normsRepo.incrementApplied(db, app.normId, app.normVersion);
    return app;
  },

  async listForResult(db: SqlDatabase, resultId: string): Promise<NormApplication[]> {
    const rows = await db.select<Record<string, unknown>>(
      'SELECT * FROM norm_applications WHERE result_id = ? ORDER BY applied_at',
      [resultId],
    );
    return rows.map((r) => ({
      applicationId: r.application_id as string,
      resultId: r.result_id as string,
      normId: r.norm_id as string,
      normVersion: r.norm_version as number,
      metric: r.metric as string,
      patientDemographics: JSON.parse(r.patient_demographics as string),
      rawValue: r.raw_value as number,
      computedDeviation: JSON.parse(r.computed_deviation as string) as Deviation,
      systemSuggestion: (r.system_suggestion as string) ?? undefined,
      wasDefault: !!r.was_default,
      clinicianConfirmed: !!r.clinician_confirmed,
      isOverride: !!r.is_override,
      overrideReason: (r.override_reason as string) ?? undefined,
      appliedBy: r.applied_by as string,
      appliedAt: r.applied_at as string,
    }));
  },
};

// ---------- settings ----------

export const settingsRepo = {
  /** Произвольная строковая настройка (например, адрес сервера общей базы) */
  async getValue(db: SqlDatabase, key: string): Promise<string | undefined> {
    const rows = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return rows[0]?.value;
  },

  async setValue(db: SqlDatabase, key: string, value: string): Promise<void> {
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, value],
    );
  },

  async getScoring(db: SqlDatabase): Promise<ScoringConfig> {
    const rows = await db.select<{ value: string }>("SELECT value FROM settings WHERE key = 'scoring'");
    if (rows.length === 0) return DEFAULT_SCORING_CONFIG;
    try {
      return { ...DEFAULT_SCORING_CONFIG, ...(JSON.parse(rows[0].value) as ScoringConfig) };
    } catch {
      return DEFAULT_SCORING_CONFIG;
    }
  },

  async setScoring(db: SqlDatabase, cfg: ScoringConfig): Promise<void> {
    await db.run(
      "INSERT INTO settings (key, value) VALUES ('scoring', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [JSON.stringify(cfg)],
    );
  },
};
