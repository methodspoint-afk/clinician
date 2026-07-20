import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { subjectsRepo } from '../db/repositories';
import { EDUCATION_LABELS, Education, SEX_LABELS, Sex } from '../domain/types';

export function SubjectsScreen() {
  const { db, user, subjects, refreshSubjects, go, persist } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [age, setAge] = useState('');
  const [education, setEducation] = useState<Education>('higher');
  const [sex, setSex] = useState<'' | Sex>('');
  const [diagnosis, setDiagnosis] = useState('');
  const [medications, setMedications] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    refreshSubjects();
  }, []);

  async function create() {
    if (!db || !user) return;
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) return;
    const subject = await subjectsRepo.create(db, {
      age: ageNum,
      education,
      sex: sex || undefined,
      diagnosis: diagnosis.trim() || undefined,
      medications: medications.trim() || undefined,
      comment: comment.trim() || undefined,
      createdBy: user.userId,
    });
    await persist();
    await refreshSubjects();
    setShowForm(false);
    setAge('');
    setDiagnosis('');
    setMedications('');
    setComment('');
    go({ name: 'subject', code: subject.subjectCode });
  }

  const filtered = subjects.filter((s) => s.subjectCode.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Испытуемые</h2>
        <button className="primary" onClick={() => setShowForm(true)}>
          + Новый испытуемый
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Новый испытуемый</h3>
          <p className="muted">
            Код генерируется автоматически. ФИО не вводится — сопоставление «код → человек» вы
            храните отдельно, вне приложения. Язык респондентов — всегда русский.
          </p>
          <div className="grid3">
            <label className="field">
              <span>Возраст *</span>
              <input type="number" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
            </label>
            <label className="field">
              <span>Образование *</span>
              <select value={education} onChange={(e) => setEducation(e.target.value as Education)}>
                {Object.entries(EDUCATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Пол</span>
              <select value={sex} onChange={(e) => setSex(e.target.value as '' | Sex)}>
                <option value="">Не указан</option>
                <option value="m">Мужской</option>
                <option value="f">Женский</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Диагноз (необязательно)</span>
            <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </label>
          <label className="field">
            <span>Принимаемые препараты (необязательно; учитываются при интерпретации)</span>
            <input
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              placeholder="Например: галоперидол 5 мг/сут"
            />
          </label>
          <label className="field">
            <span>Комментарий специалиста (необязательно)</span>
            <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="row">
            <button className="primary" onClick={create} disabled={!age}>
              Создать карточку
            </button>
            <button className="secondary" onClick={() => setShowForm(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      <label className="field" style={{ maxWidth: 320 }}>
        <input placeholder="Поиск по коду…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      {filtered.length === 0 ? (
        <div className="empty">Пока нет испытуемых. Создайте первую карточку.</div>
      ) : (
        filtered.map((s) => (
          <div key={s.subjectCode} className="card clickable" onClick={() => go({ name: 'subject', code: s.subjectCode })}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{s.subjectCode}</strong>
              <span className="muted">
                {s.age} лет · {EDUCATION_LABELS[s.education]}
                {s.sex ? ` · ${SEX_LABELS[s.sex]}` : ''}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
