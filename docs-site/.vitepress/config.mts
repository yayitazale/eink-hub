import { defineConfig } from 'vitepress';

const repo = 'https://gitlab.com/yayitazale/eink-hub';

// Published by the `pages` job in .gitlab-ci.yml to https://yayitazale.gitlab.io/eink-hub/.
export default defineConfig({
  title: 'E-Ink Hub',
  description: 'Self-hosted control center for e-ink photo frames: BLOOMIN8, SwitchBot, TRMNL and your own DIY frames, with Immich.',
  lang: 'en-GB',
  base: process.env.DOCS_BASE ?? '/eink-hub/',
  // Set by scripts/build-all.mjs: which release this build documents, and where the site root is
  // (the version switcher reads versions.json from there).
  vite: {
    define: {
      __DOCS_VERSION__: JSON.stringify(process.env.DOCS_VERSION ?? 'dev'),
      __DOCS_ROOT__: JSON.stringify(process.env.DOCS_ROOT ?? '/eink-hub/'),
    },
  },
  // GitLab Pages serves the `public` folder at the repository root.
  outDir: '../public',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/eink-hub/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#1d1c1a' }],
  ],
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Devices', link: '/devices/' },
      { text: 'Build your own', link: '/diy/' },
      { text: 'API', link: '/api/' },
      { text: 'Development', link: '/development/' },
      { text: 'Changelog', link: `${repo}/-/blob/main/CHANGELOG.md` },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Hub addresses', link: '/guide/addresses' },
            { text: 'Collections & schedules', link: '/guide/schedules' },
            { text: 'Immich', link: '/guide/immich' },
            { text: 'Bluetooth wake', link: '/guide/bluetooth' },
          ],
        },
      ],
      '/devices/': [
        {
          text: 'Devices',
          items: [
            { text: 'Overview', link: '/devices/' },
            { text: 'BLOOMIN8', link: '/devices/bloomin8' },
            { text: 'SwitchBot AI Art Frame', link: '/devices/switchbot' },
            { text: 'TRMNL firmware', link: '/devices/trmnl' },
            { text: 'Not supported (yet)', link: '/devices/unsupported' },
          ],
        },
      ],
      '/diy/': [
        {
          text: 'Build your own frame',
          items: [
            { text: 'What a frame must do', link: '/diy/' },
            { text: 'Open Frame protocol', link: '/diy/protocol' },
            { text: 'ESP32 example', link: '/diy/esp32' },
            { text: 'Raspberry Pi example', link: '/diy/raspberry-pi' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Interactive reference', link: '/api/reference' },
          ],
        },
      ],
      '/development/': [
        {
          text: 'Development',
          items: [
            { text: 'Contributing', link: '/development/' },
            { text: 'Versioning & releases', link: '/development/versioning' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'gitlab', link: repo }],
    editLink: { pattern: `${repo}/-/edit/main/docs-site/:path`, text: 'Edit this page on GitLab' },
    search: { provider: 'local' },
    footer: {
      message: `Released under the <a href="${repo}/-/blob/main/LICENSE">MIT License</a>. Not affiliated with BLOOMIN8, SwitchBot or TRMNL.`,
      copyright: '© 2026 <a href="https://josebaegia.me/">Joseba Egia</a>',
    },
  },
});
