import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import OldVersionBanner from './OldVersionBanner.vue';
import VersionSwitcher from './VersionSwitcher.vue';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'layout-top': () => h(OldVersionBanner),
      'nav-bar-content-after': () => h(VersionSwitcher),
      'nav-screen-content-after': () => h(VersionSwitcher),
    }),
};
