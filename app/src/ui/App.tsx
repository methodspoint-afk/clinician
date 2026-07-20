import { useApp } from '../store';
import { ProfilesScreen } from './ProfilesScreen';
import { SubjectsScreen } from './SubjectsScreen';
import { SubjectCard } from './SubjectCard';
import { Examination } from './Examination';
import { SummaryReport } from './SummaryReport';
import { NormsScreen } from './NormsScreen';
import { MethodsScreen } from './MethodsScreen';
import { SyncScreen } from './SyncScreen';
import { SettingsScreen } from './SettingsScreen';

export function App() {
  const { user, route, go, logout, online } = useApp();

  if (!user || route.name === 'profiles') return <ProfilesScreen />;

  const nav: { label: string; route: Parameters<typeof go>[0]; ownerOnly?: boolean }[] = [
    { label: 'Испытуемые', route: { name: 'subjects' } },
    { label: 'Нормы', route: { name: 'norms' }, ownerOnly: true },
    { label: 'Методики', route: { name: 'methods' }, ownerOnly: true },
    { label: 'Синхронизация', route: { name: 'sync' }, ownerOnly: true },
    { label: 'Настройки', route: { name: 'settings' }, ownerOnly: true },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>Реестр патопсихологических методик</h1>
        {nav
          .filter((n) => !n.ownerOnly || user.role === 'owner')
          .map((n) => (
            <button
              key={n.label}
              className={route.name === n.route.name ? 'active' : ''}
              onClick={() => go(n.route)}
            >
              {n.label}
            </button>
          ))}
        <div className="spacer" />
        <div className="userbox">
          {user.displayName}
          <br />
          <span style={{ fontSize: 12 }}>{user.role === 'owner' ? 'Владелец (Owner)' : 'Исследователь'}</span>
        </div>
        <button onClick={logout}>Сменить профиль</button>
      </aside>
      <main className="main">
        {!online && (
          <div className="warn offline no-print">
            Вы в офлайн-режиме — нет доступа к интернет-источникам и общей базе; выводы строятся
            только по ранее загруженным нормам и заключениям.
          </div>
        )}
        {route.name === 'subjects' && <SubjectsScreen />}
        {route.name === 'subject' && <SubjectCard code={route.code} />}
        {route.name === 'exam' && <Examination code={route.code} />}
        {route.name === 'report' && <SummaryReport code={route.code} />}
        {route.name === 'norms' && <NormsScreen />}
        {route.name === 'methods' && <MethodsScreen />}
        {route.name === 'sync' && <SyncScreen />}
        {route.name === 'settings' && <SettingsScreen />}
      </main>
    </div>
  );
}
