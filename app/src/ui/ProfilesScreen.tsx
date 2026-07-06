import { useState } from 'react';
import { useApp } from '../store';
import { usersRepo } from '../db/repositories';
import { Role } from '../domain/types';

export function ProfilesScreen() {
  const { db, users, refreshUsers, login, persist } = useApp();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>(users.length === 0 ? 'owner' : 'researcher');
  const [creating, setCreating] = useState(users.length === 0);

  async function createProfile() {
    if (!db || !name.trim()) return;
    // Первый профиль в системе — всегда Owner
    const actualRole: Role = users.length === 0 ? 'owner' : role;
    const user = await usersRepo.create(db, name.trim(), actualRole);
    await persist();
    await refreshUsers();
    await login(user);
  }

  return (
    <div className="main" style={{ margin: '0 auto', maxWidth: 560, paddingTop: 60 }}>
      <h2>Выбор профиля</h2>
      <p className="muted">
        Каждый специалист работает под своим профилем и видит только своих испытуемых.
        Владелец (Owner) дополнительно управляет базой норм.
      </p>

      {users.map((u) => (
        <div key={u.userId} className="card clickable" onClick={() => login(u)}>
          <strong>{u.displayName}</strong>
          <div className="muted">{u.role === 'owner' ? 'Владелец (Owner)' : 'Исследователь'}</div>
        </div>
      ))}

      {creating || users.length === 0 ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Новый профиль</h3>
          <label className="field">
            <span>Имя профиля</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Степан" />
          </label>
          {users.length > 0 && (
            <label className="field">
              <span>Роль</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="researcher">Исследователь (вводит результаты)</option>
                <option value="owner">Владелец (управляет нормами)</option>
              </select>
            </label>
          )}
          {users.length === 0 && <p className="muted">Первый профиль автоматически становится владельцем.</p>}
          <button className="primary" onClick={createProfile} disabled={!name.trim()}>
            Создать и войти
          </button>
        </div>
      ) : (
        <button className="secondary" onClick={() => setCreating(true)}>
          + Новый профиль
        </button>
      )}
    </div>
  );
}
