import { useState } from 'react';
import { Copy, Fingerprint, KeyRound, Link2, LogOut, Trash2, User as UserIcon, UserCog, UserPlus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useMe, type Role } from '../lib/me';
import { cancelled, deviceName, passkeysAvailable, registerPasskey } from '../lib/passkeys';
import { dateTime, relativeTime } from '../lib/format';
import { useI18n } from '../i18n';
import { Button, Card, Field, IconButton, Modal, Pill, inputClass, useConfirm, useToast } from './ui';
import { Select } from './Select';
import { logout } from './Layout';

const PASSKEYS_GUIDE_URL = 'https://yayitazale.github.io/eink-hub/guide/users#passkeys';

const ROLE_ICONS = { admin: UserCog, member: UserIcon } satisfies Record<Role, unknown>;

interface Passkey {
  id: string;
  name: string;
  rpId: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface User {
  id: number;
  username: string;
  role: Role;
  createdAt: number;
  lastLoginAt: number | null;
  hasPassword: boolean;
  passkeys: number;
}

interface PendingInvite {
  id: string;
  role: Role;
  /** Reset link for this account. */
  username: string | null;
  createdAt: number;
  expiresAt: number;
}

interface InviteLink {
  url: string;
  qr: string;
  expiresAt: number;
}

export function AccountSettings() {
  const { t } = useI18n();
  const me = useMe();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const save = useAction(() => api.post('/api/me/password', { current, password }), { success: t('settings.password_changed'), invalidate: [] });
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t('settings.account')}</h2>
          <p className="mt-1 text-sm text-muted">
            {t('settings.account_signed_in', { name: me?.user?.username ?? '' })} · {t(`users.role_${me?.user?.role ?? 'member'}`)}
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={<LogOut className="size-4" />} onClick={logout}>
          {t('layout.logout')}
        </Button>
      </div>
      <h3 className="mt-6 text-sm font-bold">{t('settings.password')}</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.password_current')}>
          <input type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('settings.password_new')}>
          <input type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
      <Button
        className="mt-4"
        loading={save.isPending}
        disabled={password.length < 6}
        onClick={() =>
          save.mutate(undefined, {
            onSuccess: () => {
              setCurrent('');
              setPassword('');
            },
          })
        }
      >
        {t('settings.password_change')}
      </Button>
    </Card>
  );
}

export function PasskeySettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ['passkeys'], queryFn: () => api.get<Passkey[]>('/api/passkeys') });
  const [name, setName] = useState(deviceName);
  const [adding, setAdding] = useState(false);
  const available = passkeysAvailable();
  const host = window.location.hostname;
  const remove = useAction((id: string) => api.del(`/api/passkeys/${encodeURIComponent(id)}`), { success: t('settings.passkey_deleted'), invalidate: [['passkeys'], ['me']] });

  const add = async () => {
    setAdding(true);
    try {
      await registerPasskey(name.trim() || deviceName());
      toast(t('settings.passkey_added'), 'ok');
      qc.invalidateQueries({ queryKey: ['passkeys'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      if (!cancelled(err)) toast((err as Error).message, 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Fingerprint className="size-5" />
        {t('settings.passkeys')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('settings.passkeys_hint')}</p>
      {!!list.data?.length && (
        <ul className="mt-5 divide-y divide-line/70 rounded-2xl border border-line/70">
          {list.data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {p.name}
                  {p.rpId !== host && <Pill>{p.rpId}</Pill>}
                </div>
                <div className="text-xs text-muted">
                  {t('settings.passkey_created', { date: dateTime(p.createdAt) })} ·{' '}
                  {p.lastUsedAt ? t('settings.passkey_last_used', { when: relativeTime(p.lastUsedAt) }) : t('settings.passkey_never')}
                </div>
              </div>
              <IconButton
                aria-label={t('common.delete')}
                onClick={async () => {
                  if (await confirm({ title: t('common.delete'), message: t('settings.passkey_delete_confirm', { name: p.name }) })) remove.mutate(p.id);
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {available ? (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label={t('settings.passkey_name')}>
            <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button icon={<Fingerprint className="size-4" />} loading={adding} onClick={add}>
            {t('settings.passkey_add')}
          </Button>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {t('settings.passkey_https_only')}{' '}
          <a href={PASSKEYS_GUIDE_URL} target="_blank" rel="noreferrer" className="font-semibold underline">
            {t('settings.passkey_guide')}
          </a>
        </p>
      )}
    </Card>
  );
}

function InviteSheet({ link, onClose }: { link: InviteLink | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  if (!link) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast(t('users.link_copied'), 'ok');
    } catch {
      toast(link.url, 'ok');
    }
  };
  return (
    <Modal open onClose={onClose} title={t('users.invite_link')} wide="sm">
      <p className="text-sm text-muted">{t('users.invite_link_hint', { date: dateTime(link.expiresAt) })}</p>
      <div className="mx-auto mt-5 w-56 rounded-2xl bg-white p-3" dangerouslySetInnerHTML={{ __html: link.qr }} />
      <div className="mt-5 flex gap-2">
        <input readOnly className={inputClass} value={link.url} onFocus={(e) => e.target.select()} />
        <Button icon={<Copy className="size-4" />} onClick={copy}>
          {t('users.copy')}
        </Button>
      </div>
      {navigator.share && (
        <Button className="mt-3 w-full" icon={<Link2 className="size-4" />} onClick={() => navigator.share({ url: link.url }).catch(() => {})}>
          {t('users.share')}
        </Button>
      )}
    </Modal>
  );
}

export function UsersSettings() {
  const { t } = useI18n();
  const me = useMe();
  const confirm = useConfirm();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/api/users') });
  const invites = useQuery({ queryKey: ['invites'], queryFn: () => api.get<PendingInvite[]>('/api/invites') });
  const [role, setRole] = useState<Role>('member');
  const [link, setLink] = useState<InviteLink | null>(null);
  const invalidate = [['users'], ['invites']];
  const invite = useAction(() => api.post<InviteLink>('/api/invites', { role }), { invalidate });
  const reset = useAction((id: number) => api.post<InviteLink>(`/api/users/${id}/reset`), { invalidate });
  const setUserRole = useAction((b: { id: number; role: Role }) => api.patch(`/api/users/${b.id}`, { role: b.role }), { success: t('common.saved'), invalidate });
  const remove = useAction((id: number) => api.del(`/api/users/${id}`), { success: t('users.deleted'), invalidate });
  const revoke = useAction((id: string) => api.del(`/api/invites/${encodeURIComponent(id)}`), { invalidate });
  const roleOptions = (['admin', 'member'] as const).map((r) => {
    const Icon = ROLE_ICONS[r];
    return {
      value: r,
      text: t(`users.role_${r}`),
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" />
          {t(`users.role_${r}`)}
        </span>
      ),
    };
  });

  return (
    <div className="grid gap-6">
      <Card className="p-6">
        <h2 className="text-lg font-bold">{t('users.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('users.hint')}</p>
        <ul className="mt-5 divide-y divide-line/70 rounded-2xl border border-line/70">
          {users.data?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              {/* Phones: name on its own line, controls below it. */}
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {u.username}
                  {u.id === me?.user?.id && <Pill tone="accent">{t('users.you')}</Pill>}
                  {u.passkeys > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                      <Fingerprint className="size-3.5" />
                      {u.passkeys}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {u.lastLoginAt ? t('users.last_login', { when: relativeTime(u.lastLoginAt) }) : t('users.never_logged_in')}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Select
                  aria-label={t('users.role')}
                  value={u.role}
                  onChange={(v) => setUserRole.mutate({ id: u.id, role: v as Role })}
                  options={roleOptions}
                  className="h-9! w-auto! rounded-full! px-3! text-xs! font-semibold"
                />
                <IconButton aria-label={t('users.reset')} title={t('users.reset')} onClick={() => reset.mutate(u.id, { onSuccess: setLink })}>
                  <KeyRound className="size-4" />
                </IconButton>
                <IconButton
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    if (await confirm({ title: t('common.delete'), message: t('users.delete_confirm', { name: u.username }) })) remove.mutate(u.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold">{t('users.invite')}</h2>
        <p className="mt-1 text-sm text-muted">{t('users.invite_hint')}</p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label={t('users.role')}>
            <Select value={role} onChange={(v) => setRole(v as Role)} options={roleOptions} />
          </Field>
          <Button variant="primary" icon={<UserPlus className="size-4" />} loading={invite.isPending} onClick={() => invite.mutate(undefined, { onSuccess: setLink })}>
            {t('users.invite_create')}
          </Button>
        </div>
        {!!invites.data?.length && (
          <>
            <h3 className="mt-6 text-sm font-bold">{t('users.pending')}</h3>
            <ul className="mt-3 divide-y divide-line/70 rounded-2xl border border-line/70">
              {invites.data.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold">{i.username ? t('users.pending_reset', { name: i.username }) : t(`users.role_${i.role}`)}</div>
                    <div className="text-xs text-muted">{t('users.expires', { date: dateTime(i.expiresAt) })}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                    {t('users.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <InviteSheet link={link} onClose={() => setLink(null)} />
    </div>
  );
}
