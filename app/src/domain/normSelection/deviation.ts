import { Deviation, Norm } from '../types';

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Расчёт отклонения значения испытуемого от нормы.
 * Перцентили предпочтительнее z-оценки (важно для скошенных распределений времени);
 * направление интерпретации определяется higher_is_worse — знак не путать.
 */
export function computeDeviation(value: number, norm: Norm): Deviation {
  if (norm.statForm === 'percentile_table' && norm.percentiles) {
    return percentileDeviation(value, norm);
  }
  if (norm.mean !== undefined && norm.sd !== undefined && norm.sd > 0) {
    return zDeviation(value, norm);
  }
  return {
    kind: 'none',
    value: 0,
    text: 'Норма не содержит данных для количественного сравнения (нет перцентилей и SD)',
  };
}

function percentileDeviation(value: number, norm: Norm): Deviation {
  const entries = Object.entries(norm.percentiles!)
    .map(([p, v]) => ({ p: Number(p), v: Number(v) }))
    .filter((e) => Number.isFinite(e.p) && Number.isFinite(e.v))
    .sort((x, y) => x.p - y.p);

  if (entries.length < 2) {
    return { kind: 'none', value: 0, text: 'Перцентильная таблица неполна (менее двух точек)' };
  }

  const ascending = entries[entries.length - 1].v >= entries[0].v;
  const cmp = (a: number, b: number) => (ascending ? a - b : b - a);

  let percentile: number;
  let bounded: 'below' | 'above' | undefined;

  if (cmp(value, entries[0].v) <= 0) {
    percentile = entries[0].p;
    bounded = 'below';
  } else if (cmp(value, entries[entries.length - 1].v) >= 0) {
    percentile = entries[entries.length - 1].p;
    bounded = 'above';
  } else {
    percentile = entries[entries.length - 1].p;
    for (let i = 0; i < entries.length - 1; i++) {
      const lo = entries[i];
      const hi = entries[i + 1];
      if (cmp(value, lo.v) >= 0 && cmp(value, hi.v) <= 0) {
        const span = hi.v - lo.v;
        const frac = span === 0 ? 0 : (value - lo.v) / span;
        percentile = lo.p + frac * (hi.p - lo.p);
        break;
      }
    }
  }

  percentile = round1(percentile);
  const pText = bounded === 'below' ? `≤${percentile}` : bounded === 'above' ? `≥${percentile}` : `${percentile}`;
  // Перцентиль по возрастанию значения: значение больше, чем у P% выборки.
  const direction = norm.higherIsWorse
    ? (ascending ? percentile : 100 - percentile) // выше значение = хуже
    : (ascending ? percentile : 100 - percentile);
  const wording = norm.higherIsWorse
    ? `хуже, чем у ${round1(direction)} % нормативной выборки`
    : `лучше, чем у ${round1(direction)} % нормативной выборки`;

  // «Повышение/снижение показателя» — по положению значения относительно медианы
  // нормы (для клинициста важнее направления перцентиля как числа)
  const raised = ascending ? percentile > 50 : percentile < 50;
  const dirWord =
    percentile === 50 ? 'Показатель на уровне медианы' : raised ? 'Повышение показателя' : 'Снижение показателя';

  return {
    kind: 'percentile',
    value: percentile,
    bounded,
    text: `${dirWord} относительно нормы условно здоровых; соответствует ${pText}-му перцентилю (${wording})`,
  };
}

function zDeviation(value: number, norm: Norm): Deviation {
  const z = (value - norm.mean!) / norm.sd!;
  const zr = round1(z);
  const raised = z > 0; // значение выше среднего нормы
  const worse = raised === norm.higherIsWorse && Math.abs(z) > 0;
  // Формулировка «снижение/повышение показателя + сила» — запрос клинициста:
  // не голое число, а направление и выраженность относительно условно здоровых.
  let dirText: string;
  if (Math.abs(z) < 1) {
    dirText = `Показатель в пределах нормы условно здоровых (отклонение < 1 σ; z = ${zr >= 0 ? '+' : ''}${zr})`;
  } else {
    const severity = Math.abs(z) >= 2 ? 'выраженное' : 'умеренное';
    dirText =
      `${raised ? 'Повышение' : 'Снижение'} показателя относительно нормы условно здоровых: ` +
      `${severity} (~${Math.abs(zr)} σ, z = ${zr >= 0 ? '+' : ''}${zr}), в сторону ${worse ? 'ухудшения' : 'улучшения'}`;
  }
  const warning = norm.isSkewed
    ? ' ⚠ Распределение скошено: пороги на хвостах приблизительны, предпочтительна перцентильная норма.'
    : '';
  return {
    kind: 'z',
    value: zr,
    skewedWarning: norm.isSkewed,
    text: `${dirText}.${warning}`,
  };
}
