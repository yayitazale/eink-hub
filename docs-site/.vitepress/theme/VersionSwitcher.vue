<script setup lang="ts">
import { computed } from 'vue';
import { currentVersion, pathIn, useVersions } from './versions';

const versions = useVersions();
const here = computed(() => versions.value.find((v) => v.version === currentVersion));
const label = (v: { version: string; latest: boolean }) =>
  v.version === 'main' ? 'main (unreleased)' : v.latest ? `${v.version} (latest)` : v.version;

function go(e: Event) {
  const target = versions.value.find((v) => v.version === (e.target as HTMLSelectElement).value);
  if (target) window.location.href = pathIn(target, here.value, window.location.pathname);
}
</script>

<template>
  <label class="version-switcher" title="Documentation version">
    <span class="visually-hidden">Version</span>
    <select :value="currentVersion" @change="go">
      <option v-if="!here" :value="currentVersion">{{ currentVersion }}</option>
      <option v-for="v in versions" :key="v.version" :value="v.version">{{ label(v) }}</option>
    </select>
  </label>
</template>

<style scoped>
.version-switcher {
  display: flex;
  align-items: center;
  margin-left: 12px;
}
select {
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 4px 8px;
  cursor: pointer;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
