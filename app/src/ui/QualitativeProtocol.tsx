import { QualitativeConfig } from '../domain/types';

/** Таблица протокола качественной пробы (ответы испытуемого построчно). */
export function QualitativeProtocol({
  config,
  rows,
}: {
  config?: QualitativeConfig;
  rows?: Record<string, string>[];
}) {
  if (!config || !rows || rows.length === 0) return null;
  return (
    <table style={{ marginTop: 8 }}>
      <thead>
        <tr>
          <th>#</th>
          {config.fields.map((f) => (
            <th key={f.id}>{f.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            {config.fields.map((f) => (
              <td key={f.id}>{row[f.id] || '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
