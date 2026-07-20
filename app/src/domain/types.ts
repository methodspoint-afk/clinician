// Доменные типы. Ни одна сущность не содержит ФИО испытуемого.

export type Role = 'owner' | 'researcher';

export interface User {
  userId: string;
  displayName: string;
  role: Role;
}

export type Education = 'primary' | 'secondary' | 'vocational' | 'higher' | 'unknown';
export type Sex = 'm' | 'f';

export const EDUCATION_LABELS: Record<Education, string> = {
  primary: 'Начальное',
  secondary: 'Среднее',
  vocational: 'Среднее специальное',
  higher: 'Высшее',
  unknown: 'Неизвестно',
};

export const SEX_LABELS: Record<Sex, string> = { m: 'Мужской', f: 'Женский' };

// Язык респондентов всегда русский (решение заказчика) — поле в карточке отсутствует.
export const SUBJECT_LANGUAGE = 'ru';

export interface Subject {
  subjectCode: string; // PSY-ГГГГ-XXXX
  age: number;
  education: Education;
  sex?: Sex;
  diagnosis?: string;
  /** Принимаемые препараты — влияют на интерпретацию когнитивных показателей */
  medications?: string;
  /** Свободный комментарий специалиста к карточке */
  comment?: string;
  createdBy: string;
  createdAt: string;
}

// ---------- Методика (конфигурируемая) ----------

export interface MeasureDef {
  id: string;
  label: string;
  type: 'number';
  min?: number;
  max?: number;
}

export interface DerivedDef {
  id: string;
  label: string;
  /** Арифметическое выражение над id замеров и ранее вычисленных показателей */
  expr?: string;
  higherIsWorse: boolean;
  compareWithNorm: boolean;
}

export type GateSeverity = 'flag' | 'fail';

export interface MethodGateConfig {
  educationMismatch: GateSeverity;
  languageMismatch: GateSeverity;
  /**
   * Допустимый заход возраста за ячейку нормы внутри взрослого диапазона 16–60
   * (когнитивные методики; для личностных ставить 0). По умолчанию 10 лет.
   */
  ageStretchYears?: number;
}

/** Психическая сфера, которую измеряет методика (для группировки отчёта) */
export type MethodDomain = 'attention' | 'memory' | 'thinking' | 'other';

export const METHOD_DOMAIN_LABELS: Record<MethodDomain, string> = {
  attention: 'Внимание и работоспособность',
  memory: 'Память',
  thinking: 'Мышление',
  other: 'Другое',
};

export const METHOD_DOMAIN_ORDER: MethodDomain[] = ['attention', 'memory', 'thinking', 'other'];

// ---------- Качественные пробы (протокол ответов) ----------
// Числовые нормы неприменимы (ТЗ, раздел 7): методика задаёт колонки протокола,
// специалист вносит строки. Система не выдаёт «отклонение N σ» и не подсказывает
// квалификацию — цель на этом этапе только накопить базу ответов.

export type QualFieldType = 'text' | 'choice';

export interface QualFieldDef {
  id: string;
  label: string;
  type: QualFieldType;
  /** Варианты для type='choice' */
  options?: string[];
  placeholder?: string;
}

export interface QualitativeConfig {
  /** Название единицы протокола (напр. «Задание», «Слово-стимул») */
  itemLabel: string;
  fields: QualFieldDef[];
}

export interface MethodConfig {
  measures: MeasureDef[];
  derived: DerivedDef[];
  /** Показатели-замеры, которые сравниваются с нормой напрямую (без формулы) */
  compareMeasures?: { id: string; higherIsWorse: boolean }[];
  gate: MethodGateConfig;
  domain?: MethodDomain;
  /** Конфигурация протокола для качественных методик (measureType='qualitative') */
  qualitative?: QualitativeConfig;
}

export interface Method {
  methodId: string;
  name: string;
  measureType: 'quantitative' | 'qualitative';
  config: MethodConfig;
  isActive: boolean;
}

// ---------- Норма ----------

export type SourceType =
  | 'indexed_article'
  | 'standardization_manual'
  | 'dissertation'
  | 'monograph'
  | 'methodical_guide'
  | 'other';

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  indexed_article: 'Рецензируемая статья',
  standardization_manual: 'Руководство по стандартизации',
  dissertation: 'Диссертация',
  monograph: 'Монография',
  methodical_guide: 'Методичка',
  other: 'Другое',
};

export type ValidationStatus = 'draft' | 'validated' | 'rejected' | 'archived';

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  draft: 'Черновик',
  validated: 'Проверена',
  rejected: 'Отклонена',
  archived: 'В архиве',
};

export type StatForm = 'percentile_table' | 'mean_sd' | 'cutoff' | 'qualitative_rubric';

export const STAT_FORM_LABELS: Record<StatForm, string> = {
  percentile_table: 'Перцентильная таблица',
  mean_sd: 'Среднее ± SD',
  cutoff: 'Готовые пороги (cut-off)',
  qualitative_rubric: 'Качественный рубрикатор',
};

export type ProcedureMatch = 'full' | 'minor_diff' | 'mismatch';

export const PROCEDURE_MATCH_LABELS: Record<ProcedureMatch, string> = {
  full: 'Полное совпадение процедуры',
  minor_diff: 'Мелкие отличия процедуры',
  mismatch: 'Другая метрика / другой протокол',
};

export type QualityTier = 'reliable' | 'acceptable' | 'weak' | 'unfit';

export const QUALITY_TIER_LABELS: Record<QualityTier, string> = {
  reliable: 'Надёжная',
  acceptable: 'Приемлемая',
  weak: 'Слабая',
  unfit: 'Непригодная',
};

export type NormFlag =
  | 'edge_of_cell'
  | 'age_stretch'
  | 'skewed_distribution'
  | 'old_data'
  | 'procedure_mismatch'
  | 'no_education_strata'
  | 'education_mismatch'
  | 'culture_mismatch'
  | 'year_is_publication';

export const NORM_FLAG_LABELS: Record<NormFlag, string> = {
  edge_of_cell: 'Пациент на границе возрастной ячейки',
  age_stretch: 'Возраст вне ячейки нормы (в пределах взрослого допуска 16–60, до 10 лет)',
  skewed_distribution: 'Скошенное распределение (пороги на хвостах приблизительны)',
  old_data: 'Старые данные (сбор > 35 лет назад)',
  procedure_mismatch: 'Процедура/метрика отличается от вашей',
  no_education_strata: 'Норма не стратифицирована по образованию',
  education_mismatch: 'Образование испытуемого не совпадает со стратой нормы',
  culture_mismatch: 'Иная культурная/языковая выборка (невербальная проба)',
  year_is_publication: 'Год сбора данных неизвестен — использован год публикации',
};

export type ClinicalStatus = 'healthy' | 'clinical_group';

export interface Norm {
  normId: string;
  version: number;
  // идентификация
  sourceRef: string;
  sourceType: SourceType;
  enteredBy?: string;
  enteredAt?: string;
  validatedBy?: string;
  validatedAt?: string;
  validationStatus: ValidationStatus;
  // привязка к методике
  methodId: string;
  methodVariant?: string;
  metric: string;
  procedureMatch: ProcedureMatch;
  procedureNotes?: string;
  // популяция (вход Gate); language — язык СТИМУЛЬНОГО МАТЕРИАЛА,
  // язык публикации-источника может быть любым и на Gate не влияет
  ageMin: number;
  ageMax: number;
  educationLevel: Education | 'not_stratified';
  sex?: Sex;
  language: string;
  cultureRegion?: string;
  clinicalStatus: ClinicalStatus;
  cellN: number;
  totalStudyN?: number;
  // статистика (вход расчёта)
  statForm: StatForm;
  mean?: number;
  sd?: number;
  percentiles?: Record<string, number>;
  distributionNote?: string;
  isSkewed: boolean;
  higherIsWorse: boolean;
  // метаданные качества (вход Score)
  dataCollectionYear?: number;
  publicationYear?: number;
  stratifiedBy: string[];
  peerReviewed?: boolean;
  qualityScore?: number;
  qualityTier?: QualityTier;
  flags: NormFlag[];
  // служебное
  supersedes?: string;
  active: boolean;
  appliedCount: number;
}

// ---------- Результаты ----------

export interface TestResult {
  resultId: string;
  subjectCode: string;
  methodId: string;
  rawMeasures: Record<string, number>;
  derived: Record<string, number>;
  /** Строки протокола качественной пробы (по полям QualitativeConfig.fields) */
  qualitativeRows?: Record<string, string>[];
  interpretation?: string;
  shareConsent: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Deviation {
  kind: 'percentile' | 'z' | 'none';
  value: number;
  /** Значение вышло за пределы перцентильной таблицы */
  bounded?: 'below' | 'above';
  skewedWarning?: boolean;
  text: string;
}

export interface NormApplication {
  applicationId: string;
  resultId: string;
  normId: string;
  normVersion: number;
  metric: string;
  patientDemographics: { age: number; education: Education; sex?: Sex; language: string };
  rawValue: number;
  computedDeviation: Deviation;
  systemSuggestion?: string;
  wasDefault: boolean;
  clinicianConfirmed: boolean;
  isOverride: boolean;
  overrideReason?: string;
  appliedBy: string;
  appliedAt: string;
}
