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
    },
  },
];

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
