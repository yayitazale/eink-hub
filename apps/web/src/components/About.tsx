import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, CircleArrowUp } from 'lucide-react';
import type { SVGProps } from 'react';
import { api } from '../lib/api';
import { APP_VERSION, CHANGELOG_URL, DOCS_URL, REPO_URL } from '../lib/version';
import { useI18n } from '../i18n';
import { cx } from './ui';

export interface UpdateInfo {
  current: string;
  latest: string | null;
  available: boolean;
  docsUrl: string;
  repoUrl: string;
  changelogUrl: string;
  releaseUrl?: string;
  latestDocsUrl?: string;
}

/** Asks the hub, which checks the published releases at most every couple of hours; a tab left open asks again hourly. */
export function useUpdate() {
  return useQuery({
    queryKey: ['update'],
    queryFn: () => api.get<UpdateInfo>('/api/update'),
    staleTime: 3600_000,
    refetchInterval: 3600_000,
    retry: false,
  });
}

function GitHubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3" />
    </svg>
  );
}

const link = 'text-muted transition hover:text-ink';

/** Version (→ changelog), docs and repository; `compact` for the collapsed sidebar. */
export function AboutLinks({ compact, className }: { compact?: boolean; className?: string }) {
  const { t } = useI18n();
  const u = useUpdate().data;
  return (
    <div className={cx('flex items-center text-[11px] font-semibold', compact ? 'flex-col gap-2' : 'gap-3', className)}>
      <a href={u?.changelogUrl ?? CHANGELOG_URL} target="_blank" rel="noreferrer" className={cx(link, 'opacity-80')}>
        v{u?.current ?? APP_VERSION}
      </a>
      <a href={u?.docsUrl ?? DOCS_URL} target="_blank" rel="noreferrer" className={link} title={t('about.docs')} aria-label={t('about.docs')}>
        <BookOpen className="size-3.5" />
      </a>
      <a href={u?.repoUrl ?? REPO_URL} target="_blank" rel="noreferrer" className={link} title={t('about.repo')} aria-label={t('about.repo')}>
        <GitHubMark className="size-3.5" />
      </a>
    </div>
  );
}

/** Shown only when GitHub has a newer release: its notes and the docs for it. */
export function UpdateNotice({ compact, className }: { compact?: boolean; className?: string }) {
  const { t } = useI18n();
  const u = useUpdate().data;
  if (!u?.available || !u.latest) return null;
  const title = t('update.available', { version: `v${u.latest}` });
  if (compact)
    return (
      <a href={u.releaseUrl} target="_blank" rel="noreferrer" title={title} aria-label={title} className={cx('flex justify-center text-accent', className)}>
        <CircleArrowUp className="size-5" />
      </a>
    );
  return (
    <div className={cx('rounded-2xl bg-accent-soft p-3 text-[12px]', className)}>
      <p className="flex items-center gap-1.5 font-bold text-accent">
        <CircleArrowUp className="size-4 shrink-0" /> {title}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-semibold text-ink-2">
        <a href={u.releaseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink">
          {t('update.whats_new')} <ArrowUpRight className="size-3" />
        </a>
        <a href={u.latestDocsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink">
          {t('about.docs')} <ArrowUpRight className="size-3" />
        </a>
      </div>
    </div>
  );
}
