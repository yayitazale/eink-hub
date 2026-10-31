import { NavLink, Outlet } from 'react-router-dom';
import { CalendarClock, Frame as FrameIcon, Images, LogOut, Moon, PanelLeftClose, Settings, Sun, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useImmichStatus } from '../lib/hooks';
import { AboutLinks, UpdateNotice } from './About';
import { useI18n } from '../i18n';
import { cx } from './ui';
import { useMe } from '../lib/me';

const allNav = [
  { to: '/', label: 'nav.canvas', icon: FrameIcon, end: true },
  { to: '/library', label: 'nav.library', icon: Images },
  { to: '/immich', label: 'nav.immich', icon: Sparkles, immich: true },
  { to: '/schedule', label: 'nav.schedule', icon: CalendarClock },
  { to: '/settings', label: 'nav.settings', icon: Settings },
] as const;

/** Menu entries; Immich only once it has been configured. */
function useNav() {
  const { t } = useI18n();
  const immich = useImmichStatus();
  return allNav
    .filter((n) => !('immich' in n) || immich.data?.configured)
    .map((n) => ({ ...n, label: t(n.label), end: 'end' in n ? n.end : false }));
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#141311' : '#f4f1eb');
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export async function logout() {
  await api.post('/api/auth/logout');
  window.location.href = '/';
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-8" />
      <div className="leading-none">
        <div className="text-[15px] font-extrabold tracking-tight">E-INK</div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted">HUB</div>
      </div>
    </div>
  );
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar', c ? 'open' : 'collapsed');
      } catch {}
      return !c;
    });
  return [collapsed, toggle] as const;
}

export function Layout({ authDisabled }: { authDisabled: boolean }) {
  const [theme, toggleTheme] = useTheme();
  const [collapsed, toggleCollapsed] = useCollapsed();
  const { t } = useI18n();
  const nav = useNav();
  const me = useMe();
  const railItem = 'flex items-center rounded-2xl py-2.5 text-[13px] font-semibold text-muted transition hover:text-ink';
  return (
    <div className="min-h-dvh md:flex">
      <aside
        className={cx(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line/70 py-6 transition-[width] duration-200 md:flex',
          collapsed ? 'w-[76px] px-3' : 'w-64 px-5',
        )}
      >
        {/* Expanded: collapse button next to the name. Collapsed: the site icon itself expands it. */}
        {collapsed ? (
          <button
            onClick={toggleCollapsed}
            className="mx-auto rounded-xl p-1 transition hover:bg-surface"
            title={t('layout.expand')}
            aria-label={t('layout.expand')}
          >
            <img src="/favicon.svg" alt="" className="size-8" />
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Logo />
            <button
              onClick={toggleCollapsed}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface hover:text-ink"
              title={t('layout.collapse')}
              aria-label={t('layout.collapse')}
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        )}
        <nav className="mt-10 flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cx(
                  'flex items-center rounded-2xl py-2.5 text-[14px] font-semibold transition',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-4',
                  isActive ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
                )
              }
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={2} />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className={cx('mt-auto flex gap-1', collapsed ? 'flex-col items-stretch' : 'items-center')}>
          <button
            onClick={toggleTheme}
            title={collapsed ? t(theme === 'dark' ? 'layout.light_theme' : 'layout.dark_theme') : undefined}
            className={cx(railItem, collapsed ? 'justify-center' : 'gap-2 px-4')}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {!collapsed && t(theme === 'dark' ? 'layout.light' : 'layout.dark')}
          </button>
          {!authDisabled && (
            <button
              onClick={logout}
              className={cx(railItem, collapsed ? 'justify-center' : 'ml-auto min-w-0 gap-2 px-3')}
              title={me?.user ? `${t('layout.logout')} (${me.user.username})` : t('layout.logout')}
            >
              {!collapsed && me?.user && <span className="truncate">{me.user.username}</span>}
              <LogOut className="size-4 shrink-0" />
            </button>
          )}
        </div>
        <UpdateNotice compact={collapsed} className="mt-3" />
        <AboutLinks compact={collapsed} className={cx('mt-3', !collapsed && 'px-4')} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-paper/85 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <UpdateNotice compact className="p-2" />
          <button onClick={toggleTheme} className="rounded-full p-2 text-muted" aria-label={t('layout.toggle_theme')}>
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-12">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line/70 bg-surface/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur md:hidden">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx('flex flex-1 flex-col items-center gap-1 rounded-xl py-1 text-[10.5px] font-semibold', isActive ? 'text-ink' : 'text-muted')
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
