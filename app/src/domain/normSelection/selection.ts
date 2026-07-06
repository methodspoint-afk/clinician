import { ClinicalStatus, MethodGateConfig, Norm, NormFlag, Subject } from '../types';
import { gateNorm, GateResult } from './gate';
import { computeQuality, DEFAULT_SCORING_CONFIG, QualityBreakdown, ScoringConfig } from './score';

export interface RankedNorm {
  norm: Norm;
  quality: QualityBreakdown;
  gateFlags: NormFlag[];
  /** Все флаги (Gate + качество), которые видит клиницист */
  allFlags: NormFlag[];
}

export interface RejectedNorm {
  norm: Norm;
  reasons: string[];
}

export interface SelectionResult {
  status: 'ok' | 'no_valid_norm';
  ranked: RankedNorm[];
  defaultNorm?: RankedNorm;
  rejected: RejectedNorm[];
}

/**
 * Полный конвейер подбора: фильтр кандидатов → Gate → Score → тай-брейкер.
 * Отсеянные нормы возвращаются с причинами — клиницист может раскрыть их
 * и применить осознанно (override, логируется).
 */
export function selectNorms(
  subject: Subject,
  gateConfig: MethodGateConfig,
  metric: string,
  candidates: Norm[],
  options: {
    scoring?: ScoringConfig;
    currentYear?: number;
    compareWith?: ClinicalStatus;
  } = {},
): SelectionResult {
  const scoring = options.scoring ?? DEFAULT_SCORING_CONFIG;
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const compareWith = options.compareWith ?? 'healthy';

  const ranked: RankedNorm[] = [];
  const rejected: RejectedNorm[] = [];

  for (const norm of candidates) {
    // Кандидаты: только валидированные, активные, по нужному показателю и статусу выборки
    if (norm.metric !== metric) continue;
    if (norm.validationStatus !== 'validated' || !norm.active) {
      rejected.push({ norm, reasons: ['Норма не валидирована или не активна'] });
      continue;
    }
    if (norm.clinicalStatus !== compareWith) {
      rejected.push({ norm, reasons: ['Норма собрана на другой клинической группе'] });
      continue;
    }
    if (norm.sex && subject.sex && norm.sex !== subject.sex) {
      rejected.push({ norm, reasons: ['Норма для другого пола'] });
      continue;
    }

    const gate: GateResult = gateNorm(subject, norm, gateConfig);
    if (!gate.passed) {
      rejected.push({ norm, reasons: gate.failReasons });
      continue;
    }

    const quality = computeQuality(norm, scoring, currentYear);
    if (quality.tier === 'unfit') {
      rejected.push({
        norm,
        reasons: [`Непригодная по качеству (балл ${quality.total} < ${scoring.tiers.weak})`],
      });
      continue;
    }

    const allFlags = [...new Set([...gate.flags, ...quality.flags])];
    ranked.push({ norm, quality, gateFlags: gate.flags, allFlags });
  }

  // Ранжирование: по баллу; внутри кластера близких к лучшей (Δ ≤ tieBreakerDelta) —
  // тай-брейкер: выше A (стратификация/ячейка), при равенстве — выше D (свежесть).
  ranked.sort((x, y) => y.quality.total - x.quality.total);
  if (ranked.length > 1) {
    const best = ranked[0].quality.total;
    const cluster = ranked.filter((r) => best - r.quality.total <= scoring.tieBreakerDelta);
    const rest = ranked.filter((r) => best - r.quality.total > scoring.tieBreakerDelta);
    cluster.sort(
      (x, y) =>
        y.quality.a - x.quality.a ||
        y.quality.d - x.quality.d ||
        y.quality.total - x.quality.total,
    );
    ranked.length = 0;
    ranked.push(...cluster, ...rest);
  }

  if (ranked.length === 0) {
    return { status: 'no_valid_norm', ranked: [], rejected };
  }
  return { status: 'ok', ranked, defaultNorm: ranked[0], rejected };
}
