<script setup lang="ts">
// Click a screenshot in the docs to see it full size; click again or press Esc to close.
import { onBeforeUnmount, onMounted, ref } from 'vue';

const SELECTOR = '.vp-doc img[src*="/screenshots/"]';
const zoomed = ref<{ src: string; alt: string } | null>(null);

function onClick(e: MouseEvent) {
  const img = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLImageElement | null;
  if (img) zoomed.value = { src: img.currentSrc || img.src, alt: img.alt };
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') zoomed.value = null;
}

onMounted(() => {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onClick);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <Transition name="image-zoom">
    <div v-if="zoomed" class="image-zoom" role="dialog" aria-modal="true" @click="zoomed = null">
      <img :src="zoomed.src" :alt="zoomed.alt" />
    </div>
  </Transition>
</template>

<style>
.vp-doc img[src*="/screenshots/"] {
  cursor: zoom-in;
}
.image-zoom {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
}
.image-zoom img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}
.image-zoom-enter-active,
.image-zoom-leave-active {
  transition: opacity 0.2s;
}
.image-zoom-enter-from,
.image-zoom-leave-to {
  opacity: 0;
}
</style>
