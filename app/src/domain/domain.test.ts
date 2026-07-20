import { describe, expect, it } from 'vitest';
import { evaluate, FormulaError } from './formulas/evaluator';
import { computeDerived } from './formulas/derive';
import { gateNorm } from './normSelection/gate';
import { computeQuality, DEFAULT_SCORING_CONFIG } from './normSelection/score';
import { computeDeviation } from './normSelection/deviation';
import { selectNorms } from './normSelection/selection';
import { SEED_METHODS } from './seedMethods';
import { Norm, Subject } from './types';

const YEAR = 2026;

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    subjectCode: 'PSY-2026-0001',
    age: 34,
    education: 'higher',
    sex: 'm',
    createdBy: 'u1',
    createdAt: '2026-07-06',
    ...overrides,
  };
}

function makeNorm(overrides: Partial<Norm> = {}): Norm {
  return {
    normId: 'n1',
    version: 1,
    sourceRef: 'Тестовый источник',
    sourceType: 'dissertation',
    validationStatus: 'validated',
    methodId: 'schulte',
    metric: 'ER',
    procedureMatch: 'full',
    ageMin: 18,
    ageMax: 45,
    educationLevel: 'higher',
    language: 'ru',
    clinicalStatus: 'healthy',
    cellN: 120,
    statForm: 'mean_sd',
    mean: 50,
    sd: 8,
    isSkewed: false,
    higherIsWorse: true,
    dataCollectionYear: 2018,
    stratifiedBy: ['age', 'education'],
    flags: [],
    active: true,
    appliedCount: 0,
    ...overrides,
  };
}

describe('Движок формул', () => {
  it('вычисляет выражения со скобками и приоритетом', () => {
    expect(evaluate('(t1+t2+t3+t4+t5)/5', { t1: 45, t2: 50, t3: 40, t4: 55, t5: 60 })).toBe(50);
    expect(evaluate('2+2*2', {})).toBe(6);
    expect(evaluate('-t1 + 10', { t1: 4 })).toBe(6);
  });

  it('ошибка при делении на ноль и неизвестной переменной', () => {
    expect(() => evaluate('m1/m2', { m1: 3, m2: 0 })).toThrow(FormulaError);
    expect(() => evaluate('x+1', {})).toThrow(FormulaError);
  });
});

describe('Таблицы Шульте: t = [45, 50, 40, 55, 60]', () => {
  const config = SEED_METHODS.find((m) => m.methodId === 'schulte')!.config;
  const { values, errors } = computeDerived(config, { t1: 45, t2: 50, t3: 40, t4: 55, t5: 60 });

  it('ЭР = 50, ВР = 0.9, ПУ = 1.1', () => {
    expect(errors).toHaveLength(0);
    expect(values.ER).toBe(50);
    expect(values.VR).toBeCloseTo(0.9, 10);
    expect(values.PU).toBeCloseTo(1.1, 10);
  });
});

describe('Корректурная проба: t_total = 480, t1 = 220, m1 = 4, m2 = 2', () => {
  const config = SEED_METHODS.find((m) => m.methodId === 'correction_test')!.config;

  it('t2 = 260, ИУ ≈ 0.846 (повышенная утомляемость), КАВ = 2.0', () => {
    const { values, errors } = computeDerived(config, {
      t_total: 480,
      t1: 220,
      errors_total: 6,
      m1: 4,
      m2: 2,
    });
    expect(errors).toHaveLength(0);
    expect(values.t2).toBe(260);
    expect(values.IU).toBeCloseTo(220 / 260, 10);
    expect(values.IU).toBeLessThan(1);
    expect(values.KAV).toBe(2);
  });

  it('m2 = 0: КАВ не рассчитывается (ошибка, не деление на ноль)', () => {
    const { values, errors } = computeDerived(config, {
      t_total: 480,
      t1: 220,
      errors_total: 2,
      m1: 2,
      m2: 0,
    });
    expect(values.KAV).toBeUndefined();
    expect(errors.some((e) => e.id === 'KAV')).toBe(true);
    // остальные показатели при этом считаются
    expect(values.IU).toBeCloseTo(220 / 260, 10);
  });
});

describe('Методики итерации 1', () => {
  it('сравнение понятий: 20 пар, 14 адекватных → 70 %', () => {
    const config = SEED_METHODS.find((m) => m.methodId === 'concept_comparison')!.config;
    const { values, errors } = computeDerived(config, { pairs_total: 20, adequate: 14, incomparable_ok: 3 });
    expect(errors).toHaveLength(0);
    expect(values.adequate_pct).toBe(70);
  });

  it('пиктограммы: 12 предъявлено, 9 воспроизведено → 75 %', () => {
    const config = SEED_METHODS.find((m) => m.methodId === 'pictogram')!.config;
    const { values } = computeDerived(config, { words_presented: 12, words_recalled: 9 });
    expect(values.recall_pct).toBe(75);
  });

  it('воспроизведение чисел: оба показателя сравниваются с нормой', () => {
    const method = SEED_METHODS.find((m) => m.methodId === 'digit_span')!;
    expect(method.config.compareMeasures?.map((c) => c.id)).toEqual(['forward', 'backward']);
  });
});

describe('Расчёт отклонения', () => {
  it('z-оценка: 62 с при M=50, SD=8, higher_is_worse → z = +1.5, ухудшение', () => {
    const dev = computeDeviation(62, makeNorm());
    expect(dev.kind).toBe('z');
    expect(dev.value).toBe(1.5);
    expect(dev.text).toContain('ухудшения');
  });

  it('10 слов: p5 = 9 при M=9.1, SD=0.8, higher_is_worse=false → z ≈ −0.1, в пределах нормы (знак не перепутан)', () => {
    const dev = computeDeviation(9, makeNorm({ mean: 9.1, sd: 0.8, higherIsWorse: false, metric: 'p5' }));
    expect(dev.kind).toBe('z');
    expect(dev.value).toBeCloseTo(-0.1, 5);
    expect(dev.text).toContain('в пределах нормы');
  });

  it('перцентильная интерполяция: 62 → 80-й перцентиль, «хуже, чем у 80 %»', () => {
    const dev = computeDeviation(
      62,
      makeNorm({
        statForm: 'percentile_table',
        percentiles: { '10': 35, '25': 40, '50': 48, '75': 58, '90': 70 },
      }),
    );
    expect(dev.kind).toBe('percentile');
    expect(dev.value).toBe(80);
    expect(dev.text).toContain('80');
    expect(dev.text).toContain('хуже');
  });

  it('значение за пределами таблицы — ограниченная оценка', () => {
    const norm = makeNorm({
      statForm: 'percentile_table',
      percentiles: { '10': 35, '50': 48, '90': 70 },
    });
    expect(computeDeviation(30, norm).bounded).toBe('below');
    expect(computeDeviation(80, norm).bounded).toBe('above');
  });

  it('скошенное распределение при z-оценке — предупреждение', () => {
    const dev = computeDeviation(62, makeNorm({ isSkewed: true }));
    expect(dev.skewedWarning).toBe(true);
    expect(dev.text).toContain('скошено');
  });
});

describe('Score (веса итерации 1: D=5, E=20 — калибровка по обратной связи клинициста)', () => {
  it('cell_n=120 + стратификация age/education, mean+sd скошено, процедура полная, сбор 2018, диссертация → 84, надёжная', () => {
    const q = computeQuality(makeNorm({ isSkewed: true }), DEFAULT_SCORING_CONFIG, YEAR);
    expect(q.a).toBe(30);
    expect(q.b).toBe(15);
    expect(q.c).toBe(20);
    expect(q.d).toBe(5);
    expect(q.e).toBe(14);
    expect(q.total).toBe(84);
    expect(q.tier).toBe('reliable');
    expect(q.flags).toContain('skewed_distribution');
  });

  it('статус источника весит больше свежести: рецензируемая статья 1990-х обгоняет методичку 2024 года', () => {
    const oldArticle = computeQuality(
      makeNorm({ sourceType: 'indexed_article', dataCollectionYear: 1998 }),
      DEFAULT_SCORING_CONFIG,
      YEAR,
    );
    const freshGuide = computeQuality(
      makeNorm({ sourceType: 'methodical_guide', dataCollectionYear: 2024 }),
      DEFAULT_SCORING_CONFIG,
      YEAR,
    );
    expect(oldArticle.total).toBeGreaterThan(freshGuide.total);
  });

  it('перцентильные таблицы дают больше, чем скошенное mean+sd', () => {
    const q = computeQuality(
      makeNorm({ statForm: 'percentile_table', percentiles: { '50': 48 } }),
      DEFAULT_SCORING_CONFIG,
      YEAR,
    );
    expect(q.b).toBe(25);
  });

  it('год сбора неизвестен → используется год публикации с флагом', () => {
    const q = computeQuality(
      makeNorm({ dataCollectionYear: undefined, publicationYear: 2000 }),
      DEFAULT_SCORING_CONFIG,
      YEAR,
    );
    expect(q.d).toBe(2); // 26 лет назад
    expect(q.flags).toContain('year_is_publication');
  });

  it('данные старше 35 лет → флаг old_data, но норма не обнуляется', () => {
    const q = computeQuality(makeNorm({ dataCollectionYear: 1985 }), DEFAULT_SCORING_CONFIG, YEAR);
    expect(q.d).toBe(1);
    expect(q.flags).toContain('old_data');
    expect(q.total).toBeGreaterThan(0);
  });
});

describe('Gate', () => {
  const gateCfg = { educationMismatch: 'flag' as const, languageMismatch: 'flag' as const };

  it('возраст внутри ячейки — pass; на границе — флаг edge_of_cell; вне — fail', () => {
    expect(gateNorm(makeSubject({ age: 34 }), makeNorm(), gateCfg).passed).toBe(true);
    const edge = gateNorm(makeSubject({ age: 45 }), makeNorm(), gateCfg);
    expect(edge.passed).toBe(true);
    expect(edge.flags).toContain('edge_of_cell');
    expect(gateNorm(makeSubject({ age: 83 }), makeNorm(), gateCfg).passed).toBe(false);
  });

  it('внутри 16–60 возраст плавающий: заход за ячейку до 10 лет — pass с флагом age_stretch', () => {
    // 26 лет против нормы 16–20: «16 и 26 — примерно одна возрастная группа»
    const r = gateNorm(makeSubject({ age: 26 }), makeNorm({ ageMin: 16, ageMax: 20 }), gateCfg);
    expect(r.passed).toBe(true);
    expect(r.flags).toContain('age_stretch');
  });

  it('заход больше 10 лет внутри 16–60 — fail', () => {
    const r = gateNorm(makeSubject({ age: 34 }), makeNorm({ ageMin: 45, ageMax: 60 }), gateCfg);
    expect(r.passed).toBe(false);
  });

  it('жёсткие рамки: до 16 и после 60 лет допуск не действует', () => {
    // 15 лет против нормы 16–20 — дети отдельная категория, fail несмотря на 1 год разницы
    expect(gateNorm(makeSubject({ age: 15 }), makeNorm({ ageMin: 16, ageMax: 20 }), gateCfg).passed).toBe(false);
    // 62 года против нормы 18–60 — пожилые отдельная категория
    expect(gateNorm(makeSubject({ age: 62 }), makeNorm({ ageMin: 18, ageMax: 60 }), gateCfg).passed).toBe(false);
    // но 62 года внутри ячейки нормы 55–75 — pass (норма сама покрывает этот возраст)
    expect(gateNorm(makeSubject({ age: 62 }), makeNorm({ ageMin: 55, ageMax: 75 }), gateCfg).passed).toBe(true);
  });

  it('ageStretchYears: 0 отключает допуск (личностные методики)', () => {
    const r = gateNorm(makeSubject({ age: 26 }), makeNorm({ ageMin: 16, ageMax: 20 }), {
      ...gateCfg,
      ageStretchYears: 0,
    });
    expect(r.passed).toBe(false);
  });

  it('образование: несовпадение — предупреждение (методики MVP), а не отсев', () => {
    const r = gateNorm(makeSubject({ education: 'secondary' }), makeNorm(), gateCfg);
    expect(r.passed).toBe(true);
    expect(r.flags).toContain('education_mismatch');
  });

  it('образование: для методики с educationMismatch=fail — отсев', () => {
    const r = gateNorm(makeSubject({ education: 'secondary' }), makeNorm(), {
      educationMismatch: 'fail',
      languageMismatch: 'flag',
    });
    expect(r.passed).toBe(false);
  });

  it('нестратифицированная норма или неизвестное образование — флаг no_education_strata', () => {
    const r1 = gateNorm(makeSubject(), makeNorm({ educationLevel: 'not_stratified' }), gateCfg);
    expect(r1.flags).toContain('no_education_strata');
    const r2 = gateNorm(makeSubject({ education: 'unknown' }), makeNorm(), gateCfg);
    expect(r2.flags).toContain('no_education_strata');
  });

  it('язык стимульного материала: вербальная методика — fail, невербальная — флаг culture_mismatch', () => {
    const verbal = gateNorm(makeSubject(), makeNorm({ language: 'en' }), {
      educationMismatch: 'flag',
      languageMismatch: 'fail',
    });
    expect(verbal.passed).toBe(false);
    const nonverbal = gateNorm(makeSubject(), makeNorm({ language: 'en' }), gateCfg);
    expect(nonverbal.passed).toBe(true);
    expect(nonverbal.flags).toContain('culture_mismatch');
  });
});

describe('selectNorms: сквозной подбор', () => {
  const gateCfg = { educationMismatch: 'flag' as const, languageMismatch: 'flag' as const };

  it('черновик не попадает в кандидаты (критерий приёмки №5)', () => {
    const res = selectNorms(makeSubject(), gateCfg, 'ER', [
      makeNorm({ normId: 'draft1', validationStatus: 'draft' }),
      makeNorm({ normId: 'ok1' }),
    ], { currentYear: YEAR });
    expect(res.ranked).toHaveLength(1);
    expect(res.ranked[0].norm.normId).toBe('ok1');
    expect(res.rejected.some((r) => r.norm.normId === 'draft1')).toBe(true);
  });

  it('испытуемый 83 лет, все нормы до 75 → «валидной нормы нет»', () => {
    const res = selectNorms(makeSubject({ age: 83 }), gateCfg, 'ER', [
      makeNorm({ normId: 'a', ageMin: 18, ageMax: 45 }),
      makeNorm({ normId: 'b', ageMin: 46, ageMax: 75 }),
    ], { currentYear: YEAR });
    expect(res.status).toBe('no_valid_norm');
    expect(res.ranked).toHaveLength(0);
    expect(res.rejected).toHaveLength(2);
    expect(res.rejected[0].reasons[0]).toContain('вне диапазона');
  });

  it('дефолт — норма с максимальным баллом; тай-брейкер при Δ≤5 решает A, затем D', () => {
    // Балл почти равный, но у percNorm A ниже, чем у bigCell
    const bigCell = makeNorm({
      normId: 'big_cell',
      cellN: 150,
      statForm: 'mean_sd',
      dataCollectionYear: 2024,
    }); // A=30 B=22 C=20 D=5 E=14 = 91
    const percSmall = makeNorm({
      normId: 'perc_small',
      cellN: 60,
      statForm: 'percentile_table',
      percentiles: { '50': 48 },
      dataCollectionYear: 2024,
    }); // A=22 B=25 C=20 D=5 E=14 = 86 → в кластере Δ=5, выигрывает big_cell по A
    const res = selectNorms(makeSubject(), gateCfg, 'ER', [percSmall, bigCell], { currentYear: YEAR });
    expect(res.defaultNorm!.norm.normId).toBe('big_cell');
  });

  it('непригодная норма (балл < 30) отсеивается с причиной', () => {
    const bad = makeNorm({
      normId: 'bad',
      stratifiedBy: [],
      cellN: 10,
      statForm: 'mean_sd',
      sd: undefined,
      procedureMatch: 'mismatch',
      dataCollectionYear: 1970,
      sourceType: 'other',
    }); // A=2 B=2 C=3 D=1 E=6 = 14 < 30
    const res = selectNorms(makeSubject(), gateCfg, 'ER', [bad], { currentYear: YEAR });
    expect(res.status).toBe('no_valid_norm');
    expect(res.rejected[0].reasons[0]).toContain('Непригодная');
  });

  it('нормы клинических групп не участвуют в сравнении по умолчанию', () => {
    const res = selectNorms(makeSubject(), gateCfg, 'ER', [
      makeNorm({ normId: 'clin', clinicalStatus: 'clinical_group' }),
    ], { currentYear: YEAR });
    expect(res.status).toBe('no_valid_norm');
  });

  it('флаги Gate и качества объединяются и видны', () => {
    const res = selectNorms(
      makeSubject({ age: 45, education: 'secondary' }),
      gateCfg,
      'ER',
      [makeNorm({ isSkewed: true })],
      { currentYear: YEAR },
    );
    const flags = res.defaultNorm!.allFlags;
    expect(flags).toContain('edge_of_cell');
    expect(flags).toContain('education_mismatch');
    expect(flags).toContain('skewed_distribution');
  });
});
