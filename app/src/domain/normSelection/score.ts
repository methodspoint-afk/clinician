import { Norm, NormFlag, QualityTier } from '../types';

/**
 * Конфигурация скоринга (ступень 2 — Score). Значения по умолчанию — стартовая
 * калибровочная точка из norm-selection-and-scoring.md; хранятся в settings
 * и редактируются Owner'ом, в коде — только дефолты.
 */
export interface ScoringConfig {
  a: { top: number; mid: number; small: number; tiny: number; min: number };
  b: { percentiles: number; meanSd: number; meanSdSkewed: number; cutoff: number; meanOnly: number };
  c: { full: number; minorDiff: number; mismatch: number };
  d: { fresh: number; mid: number; old: number; veryOld: number };
  e: { top: number; mid: number; low: number };
  tiers: { reliable: number; acceptable: number; weak: number };
  tieBreakerDelta: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  a: { top: 30, mid: 22, small: 15, tiny: 8, min: 2 },
  b: { percentiles: 25, meanSd: 22, meanSdSkewed: 15, cutoff: 8, meanOnly: 2 },
  c: { full: 20, minorDiff: 12, mismatch: 3 },
  d: { fresh: 15, mid: 11, old: 7, veryOld: 3 },
  e: { top: 10, mid: 7, low: 3 },
  tiers: { reliable: 75, acceptable: 50, weak: 30 },
  tieBreakerDelta: 5,
};

export interface QualityBreakdown {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  total: number;
  tier: QualityTier;
  flags: NormFlag[];
}

// A. Стратификация и размер релевантной ячейки — 30
function scoreA(norm: Norm, cfg: ScoringConfig): number {
  const strat = norm.stratifiedBy ?? [];
  if (strat.length === 0) return cfg.a.min; // общее среднее без разбивки
  if (norm.cellN >= 100 && strat.includes('age') && strat.includes('education')) return cfg.a.top;
  if (norm.cellN >= 50) return cfg.a.mid;
  if (norm.cellN >= 30) return cfg.a.small;
  if (norm.cellN >= 15) return cfg.a.tiny;
  return cfg.a.min;
}

// B. Наличие и форма меры разброса — 25
function scoreB(norm: Norm, cfg: ScoringConfig, flags: NormFlag[]): number {
  switch (norm.statForm) {
    case 'percentile_table':
      return cfg.b.percentiles;
    case 'mean_sd':
      if (norm.sd === undefined || norm.sd === null) return cfg.b.meanOnly;
      if (norm.isSkewed) {
        flags.push('skewed_distribution');
        return cfg.b.meanSdSkewed;
      }
      return cfg.b.meanSd;
    case 'cutoff':
      return cfg.b.cutoff;
    case 'qualitative_rubric':
      return 0; // числовой скоринг неприменим (отложенный этап)
  }
}

// C. Идентичность процедуры — 20
function scoreC(norm: Norm, cfg: ScoringConfig, flags: NormFlag[]): number {
  switch (norm.procedureMatch) {
    case 'full':
      return cfg.c.full;
    case 'minor_diff':
      return cfg.c.minorDiff;
    case 'mismatch':
      flags.push('procedure_mismatch');
      return cfg.c.mismatch;
  }
}

// D. Свежесть данных — 15 (по году сбора; иначе — по году публикации с флагом)
function scoreD(norm: Norm, cfg: ScoringConfig, flags: NormFlag[], currentYear: number): number {
  let year = norm.dataCollectionYear;
  if (year === undefined || year === null) {
    year = norm.publicationYear;
    if (year !== undefined && year !== null) flags.push('year_is_publication');
  }
  if (year === undefined || year === null) return cfg.d.veryOld; // год неизвестен вовсе
  const age = currentYear - year;
  if (age <= 10) return cfg.d.fresh;
  if (age <= 20) return cfg.d.mid;
  if (age <= 35) return cfg.d.old;
  flags.push('old_data');
  return cfg.d.veryOld;
}

// E. Формальный статус источника — 10 (импакт-фактор не используется)
function scoreE(norm: Norm, cfg: ScoringConfig): number {
  switch (norm.sourceType) {
    case 'indexed_article':
    case 'standardization_manual':
      return cfg.e.top;
    case 'dissertation':
    case 'monograph':
    case 'methodical_guide':
      return cfg.e.mid;
    case 'other':
      return cfg.e.low;
  }
}

export function tierOf(score: number, cfg: ScoringConfig): QualityTier {
  if (score >= cfg.tiers.reliable) return 'reliable';
  if (score >= cfg.tiers.acceptable) return 'acceptable';
  if (score >= cfg.tiers.weak) return 'weak';
  return 'unfit';
}

/** Полный расчёт качества нормы: балл 0–100, tier и флаги качества. */
export function computeQuality(
  norm: Norm,
  cfg: ScoringConfig = DEFAULT_SCORING_CONFIG,
  currentYear: number = new Date().getFullYear(),
): QualityBreakdown {
  const flags: NormFlag[] = [];
  const a = scoreA(norm, cfg);
  const b = scoreB(norm, cfg, flags);
  const c = scoreC(norm, cfg, flags);
  const d = scoreD(norm, cfg, flags, currentYear);
  const e = scoreE(norm, cfg);
  const total = a + b + c + d + e;
  return { a, b, c, d, e, total, tier: tierOf(total, cfg), flags };
}
