<script setup lang="ts">
import { computed } from 'vue';
import { currentVersion, pathIn, useVersions } from './versions';

// Shown on any version that isn't the latest release, with a link to the same page there.
const versions = useVersions();
const latest = computed(() => versions.value.find((v) => v.latest));
const here = computed(() => versions.value.find((v) => v.version === currentVersion));
const show = computed(() => !!latest.value && !!here.value && !here.value.latest);
const href = computed(() => (latest.value ? pathIn(latest.value, here.value, typeof window === 'undefined' ? '' : window.location.pathname) : '#'));
</script>

<template>
  <div v-if="show" class="old-version">
    <template v-if="currentVersion === 'main'">These docs are for the unreleased <code>main</code> branch.</template>
    <template v-else>These docs are for <strong>{{ currentVersion }}</strong>.</template>
    The latest release is <a :href="href">{{ latest!.version }}</a>.
  </div>
</template>

<style scoped>
.old-version {
  padding: 8px 16px;
  text-align: center;
  font-size: 14px;
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-text-1);
}
</style>
