import { MethodConfig } from '../types';
import { evaluate, FormulaError } from './evaluator';

export interface DeriveResult {
  values: Record<string, number>;
  errors: { id: string; message: string }[];
}

/**
 * Считает производные показатели методики по порядку объявления;
 * каждый показатель добавляется в область видимости для следующих
 * (например, ВР = t1/ЭР ссылается на уже вычисленную ЭР).
 */
export function computeDerived(config: MethodConfig, raw: Record<string, number>): DeriveResult {
  const scope: Record<string, number> = { ...raw };
  const values: Record<string, number> = {};
  const errors: { id: string; message: string }[] = [];

  for (const def of config.derived) {
    if (!def.expr) continue;
    try {
      const value = evaluate(def.expr, scope);
      values[def.id] = value;
      scope[def.id] = value;
    } catch (e) {
      errors.push({ id: def.id, message: e instanceof FormulaError ? e.message : String(e) });
    }
  }
  return { values, errors };
}

/** Человекочитаемое название показателя (замера или производного) по id */
export function metricLabel(config: MethodConfig | undefined, metricId: string): string {
  if (!config) return metricId;
  return (
    config.derived.find((d) => d.id === metricId)?.label ??
    config.measures.find((m) => m.id === metricId)?.label ??
    metricId
  );
}

/** Список показателей методики, которые сравниваются с нормой */
export function comparableMetrics(config: MethodConfig): { id: string; label: string; higherIsWorse: boolean }[] {
  const fromDerived = config.derived
    .filter((d) => d.compareWithNorm)
    .map((d) => ({ id: d.id, label: d.label, higherIsWorse: d.higherIsWorse }));
  const fromMeasures = (config.compareMeasures ?? []).map((m) => {
    const def = config.measures.find((x) => x.id === m.id);
    return { id: m.id, label: def?.label ?? m.id, higherIsWorse: m.higherIsWorse };
  });
  return [...fromDerived, ...fromMeasures];
}
