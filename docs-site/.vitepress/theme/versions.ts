import { onMounted, ref } from 'vue';

declare const __DOCS_VERSION__: string;
declare const __DOCS_ROOT__: string;

export interface DocsVersion {
  version: string;
  path: string;
  latest: boolean;
}

/** The release these docs were built for ("main" for unreleased, "dev" locally). */
export const currentVersion = __DOCS_VERSION__;

/**
 * Every published version, read at runtime from the site root so that the docs of an old
 * release still list the releases that came after it.
 */
export function useVersions() {
  const versions = ref<DocsVersion[]>([]);
  onMounted(async () => {
    try {
      const res = await fetch(`${__DOCS_ROOT__}versions.json`, { cache: 'no-cache' });
      if (res.ok) versions.value = await res.json();
    } catch {
      // Local dev server: no versions.json, the switcher just shows the current version.
    }
  });
  return versions;
}

/** Same page in another version, when it exists there (otherwise its home page). */
export function pathIn(target: DocsVersion, here: DocsVersion | undefined, location: string) {
  const rel = here && location.startsWith(here.path) ? location.slice(here.path.length) : '';
  return target.path + rel;
}
