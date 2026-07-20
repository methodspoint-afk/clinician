import { MethodGateConfig, Norm, NormFlag, Subject, SUBJECT_LANGUAGE } from '../types';

export type GateOutcome = 'pass' | 'pass_with_flag' | 'fail';

export interface GateCheck {
  criterion: 'age' | 'education' | 'language';
  outcome: GateOutcome;
  flag?: NormFlag;
  reason?: string;
}

export interface GateResult {
  passed: boolean;
  checks: GateCheck[];
  flags: NormFlag[];
  failReasons: string[];
}

// Жёсткие возрастные границы (калибровка по обратной связи клинициста, июль 2026):
// до 16 и после 60 лет психические функции менее устойчивы — дети и пожилые
// не входят в общую взрослую норму независимо от близости значений.
// Внутри 16–60 когнитивные нормы «плавающие»: заход за ячейку до 10 лет
// допустим с флагом (для личностных методик допуск отключать через ageStretchYears: 0).
export const ADULT_AGE_MIN = 16;
export const ADULT_AGE_MAX = 60;
export const DEFAULT_AGE_STRETCH_YEARS = 10;

type AgeBand = 'child' | 'adult' | 'senior';

function ageBand(age: number): AgeBand {
  if (age < ADULT_AGE_MIN) return 'child';
  if (age > ADULT_AGE_MAX) return 'senior';
  return 'adult';
}

/**
 * Ступень 1 — Gate: совпадение популяции для пары (норма, испытуемый).
 * Любой fail исключает норму из кандидатов (но клиницист может применить
 * её осознанно через override — это решается выше, в UI/логе).
 */
export function gateNorm(subject: Subject, norm: Norm, gate: MethodGateConfig): GateResult {
  const checks: GateCheck[] = [];

  // 1. Возраст
  if (subject.age < norm.ageMin || subject.age > norm.ageMax) {
    const nearestBoundary = subject.age < norm.ageMin ? norm.ageMin : norm.ageMax;
    const distance = Math.abs(subject.age - nearestBoundary);
    const stretch = gate.ageStretchYears ?? DEFAULT_AGE_STRETCH_YEARS;
    const withinAdultBand =
      ageBand(subject.age) === 'adult' && ageBand(nearestBoundary) === 'adult';
    if (withinAdultBand && distance <= stretch) {
      checks.push({
        criterion: 'age',
        outcome: 'pass_with_flag',
        flag: 'age_stretch',
        reason: `Возраст ${subject.age} вне ячейки ${norm.ageMin}–${norm.ageMax}, но в пределах взрослого допуска (±${stretch} лет)`,
      });
    } else {
      checks.push({
        criterion: 'age',
        outcome: 'fail',
        reason:
          ageBand(subject.age) !== 'adult' || !withinAdultBand
            ? `Возраст ${subject.age} вне диапазона нормы ${norm.ageMin}–${norm.ageMax} (до ${ADULT_AGE_MIN} и после ${ADULT_AGE_MAX} лет — отдельные возрастные категории)`
            : `Возраст ${subject.age} вне диапазона нормы ${norm.ageMin}–${norm.ageMax} (заход больше допуска ±${stretch} лет)`,
      });
    }
  } else if (subject.age === norm.ageMin || subject.age === norm.ageMax) {
    checks.push({ criterion: 'age', outcome: 'pass_with_flag', flag: 'edge_of_cell' });
  } else {
    checks.push({ criterion: 'age', outcome: 'pass' });
  }

  // 2. Образование
  if (norm.educationLevel === 'not_stratified' || subject.education === 'unknown') {
    checks.push({ criterion: 'education', outcome: 'pass_with_flag', flag: 'no_education_strata' });
  } else if (subject.education === norm.educationLevel) {
    checks.push({ criterion: 'education', outcome: 'pass' });
  } else if (gate.educationMismatch === 'fail') {
    checks.push({
      criterion: 'education',
      outcome: 'fail',
      reason: 'Образовательная страта не совпадает (методика критична к образованию)',
    });
  } else {
    checks.push({ criterion: 'education', outcome: 'pass_with_flag', flag: 'education_mismatch' });
  }

  // 3. Язык. Язык испытуемого — всегда русский (константа);
  // сравнивается с языком СТИМУЛЬНОГО МАТЕРИАЛА нормы. Язык публикации не важен.
  if (norm.language === SUBJECT_LANGUAGE) {
    checks.push({ criterion: 'language', outcome: 'pass' });
  } else if (gate.languageMismatch === 'fail') {
    checks.push({
      criterion: 'language',
      outcome: 'fail',
      reason: `Стимульный материал нормы на другом языке (${norm.language}) — вербальная методика`,
    });
  } else {
    checks.push({ criterion: 'language', outcome: 'pass_with_flag', flag: 'culture_mismatch' });
  }

  const flags = checks.flatMap((c) => (c.flag ? [c.flag] : []));
  const failReasons = checks.flatMap((c) => (c.outcome === 'fail' && c.reason ? [c.reason] : []));
  return { passed: failReasons.length === 0, checks, flags, failReasons };
}
