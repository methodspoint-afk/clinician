import { Method } from './types';

/** Предустановленные методики MVP (seed-данные первой миграции). */
export const SEED_METHODS: Method[] = [
  {
    methodId: 'schulte',
    name: 'Таблицы Шульте (5 таблиц)',
    measureType: 'quantitative',
    isActive: true,
    config: {
      measures: [
        { id: 't1', label: 'Время 1-й таблицы, с', type: 'number', min: 1 },
        { id: 't2', label: 'Время 2-й таблицы, с', type: 'number', min: 1 },
        { id: 't3', label: 'Время 3-й таблицы, с', type: 'number', min: 1 },
        { id: 't4', label: 'Время 4-й таблицы, с', type: 'number', min: 1 },
        { id: 't5', label: 'Время 5-й таблицы, с', type: 'number', min: 1 },
      ],
      derived: [
        {
          id: 'ER',
          label: 'Эффективность работы (ЭР)',
          expr: '(t1+t2+t3+t4+t5)/5',
          higherIsWorse: true,
          compareWithNorm: true,
        },
        { id: 'VR', label: 'Врабатываемость (ВР)', expr: 't1/ER', higherIsWorse: true, compareWithNorm: true },
        {
          id: 'PU',
          label: 'Психическая устойчивость (ПУ)',
          expr: 't4/ER',
          higherIsWorse: true,
          compareWithNorm: true,
        },
      ],
      gate: { educationMismatch: 'flag', languageMismatch: 'flag' }, // невербальная проба
      domain: 'attention',
    },
  },
  {
    methodId: 'ten_words',
    name: 'Заучивание 10 слов',
    measureType: 'quantitative',
    isActive: true,
    config: {
      measures: [
        { id: 'p1', label: 'Слов после 1-го предъявления', type: 'number', min: 0, max: 10 },
        { id: 'p2', label: 'Слов после 2-го предъявления', type: 'number', min: 0, max: 10 },
        { id: 'p3', label: 'Слов после 3-го предъявления', type: 'number', min: 0, max: 10 },
        { id: 'p4', label: 'Слов после 4-го предъявления', type: 'number', min: 0, max: 10 },
        { id: 'p5', label: 'Слов после 5-го предъявления', type: 'number', min: 0, max: 10 },
        { id: 'substitutions', label: 'Устойчивые замены слов', type: 'number', min: 0 },
        { id: 'delayed', label: 'Отсроченное воспроизведение', type: 'number', min: 0, max: 10 },
      ],
      derived: [],
      compareMeasures: [
        { id: 'p5', higherIsWorse: false },
        { id: 'delayed', higherIsWorse: false },
        { id: 'substitutions', higherIsWorse: true },
      ],
      gate: { educationMismatch: 'flag', languageMismatch: 'fail' }, // вербальная проба
      domain: 'memory',
    },
  },
  {
    methodId: 'correction_test',
    name: 'Цифровая корректурная проба (адаптация НИИ им. Бехтерева)',
    measureType: 'quantitative',
    isActive: true,
    config: {
      measures: [
        { id: 't_total', label: 'Общее время, с', type: 'number', min: 1 },
        { id: 't1', label: 'Время верхней половины, с', type: 'number', min: 1 },
        { id: 'errors_total', label: 'Число ошибок (всего)', type: 'number', min: 0 },
        { id: 'm1', label: 'Ошибки в правой половине (М1)', type: 'number', min: 0 },
        { id: 'm2', label: 'Ошибки в левой половине (М2)', type: 'number', min: 0 },
      ],
      derived: [
        {
          id: 't2',
          label: 'Время нижней половины (t₂)',
          expr: 't_total - t1',
          higherIsWorse: true,
          compareWithNorm: false,
        },
        { id: 'IU', label: 'Индекс утомляемости (ИУ)', expr: 't1/t2', higherIsWorse: false, compareWithNorm: true },
        {
          id: 'KAV',
          label: 'Коэффициент асимметрии внимания (КАВ)',
          expr: 'm1/m2',
          higherIsWorse: true,
          compareWithNorm: false,
        },
      ],
      compareMeasures: [{ id: 'errors_total', higherIsWorse: true }],
      gate: { educationMismatch: 'flag', languageMismatch: 'flag' },
      domain: 'attention',
    },
  },
  {
    methodId: 'visual_spatial_memory',
    name: 'Тест зрительно-пространственной памяти',
    measureType: 'quantitative',
    isActive: true,
    config: {
      measures: [{ id: 'score', label: 'Балл специалиста', type: 'number', min: 0 }],
      derived: [],
      compareMeasures: [{ id: 'score', higherIsWorse: false }],
      gate: { educationMismatch: 'flag', languageMismatch: 'flag' },
      domain: 'memory',
    },
  },
  // --- Методики итерации 1 (по запросу клинициста, июль 2026) ---
  {
    methodId: 'digit_span',
    name: 'Воспроизведение чисел (прямое и обратное)',
    measureType: 'quantitative',
    isActive: true,
    config: {
      measures: [
        { id: 'forward', label: 'Прямое воспроизведение (макс. длина ряда)', type: 'number', min: 0, max: 12 },
        { id: 'backward', label: 'Обратное воспроизведение (макс. длина ряда)', type: 'number', min: 0, max: 12 },
      ],
      derived: [],
      compareMeasures: [
        { id: 'forward', higherIsWorse: false },
        { id: 'backward', higherIsWorse: false },
      ],
      // Цифры предъявляются устно, но материал культурно-нейтрален — язык как флаг
      gate: { educationMismatch: 'flag', languageMismatch: 'flag' },
      domain: 'memory',
    },
  },
  {
    methodId: 'concept_comparison',
    name: 'Сравнение понятий',
    measureType: 'quantitative',
    isActive: true,
    config: {
      measures: [
        { id: 'pairs_total', label: 'Предъявлено пар понятий', type: 'number', min: 1 },
        { id: 'adequate', label: 'Сравнений по существенному признаку', type: 'number', min: 0 },
        {
          id: 'incomparable_ok',
          label: 'Несравнимых пар, верно отвергнутых',
          type: 'number',
          min: 0,
        },
      ],
      derived: [
        {
          id: 'adequate_pct',
          label: 'Доля адекватных сравнений, %',
          expr: 'adequate / pairs_total * 100',
          higherIsWorse: false,
          compareWithNorm: true,
        },
      ],
      compareMeasures: [{ id: 'adequate', higherIsWorse: false }],
      gate: { educationMismatch: 'fail', languageMismatch: 'fail' }, // вербальная, чувствительна к образованию
      domain: 'thinking',
    },
  },
  {
    methodId: 'pictogram',
    name: 'Пиктограммы (опосредованное запоминание, количественная часть)',
    measureType: 'quantitative',
    isActive: true,
    config: {
      // Качественный анализ рисунков сознательно не автоматизируется —
      // фиксируется только воспроизведение; пары «слово → ответ» вносить в комментарий
      measures: [
        { id: 'words_presented', label: 'Предъявлено слов/понятий', type: 'number', min: 1 },
        { id: 'words_recalled', label: 'Воспроизведено при отсроченном назывании', type: 'number', min: 0 },
      ],
      derived: [
        {
          id: 'recall_pct',
          label: 'Доля воспроизведения, %',
          expr: 'words_recalled / words_presented * 100',
          higherIsWorse: false,
          compareWithNorm: true,
        },
      ],
      compareMeasures: [{ id: 'words_recalled', higherIsWorse: false }],
      gate: { educationMismatch: 'flag', languageMismatch: 'fail' },
      domain: 'memory',
    },
  },
];

/** Домены методик, добавленных до появления поля domain (для старых локальных БД) */
export const METHOD_DOMAIN_FALLBACK: Record<string, import('./types').MethodDomain> = {
  schulte: 'attention',
  correction_test: 'attention',
  ten_words: 'memory',
  visual_spatial_memory: 'memory',
  digit_span: 'memory',
  pictogram: 'memory',
  concept_comparison: 'thinking',
};

/** Текстовые подсказки к показателям (осторожные, не диагноз) */
export function metricHint(methodId: string, metricId: string, value: number): string | undefined {
  if (methodId === 'correction_test' && metricId === 'IU') {
    if (value < 1) return 'ИУ < 1 — повышенная утомляемость';
    if (value > 1) return 'ИУ > 1 — врабатываемость';
    return 'ИУ = 1 — нормальная психическая активность, общая работоспособность';
  }
  if (methodId === 'correction_test' && metricId === 'errors_total') {
    return 'Норма — 1–2 ошибки';
  }
  return undefined;
}
