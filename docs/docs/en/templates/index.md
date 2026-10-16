# Templates

Choose a framework and then a template when creating a project with `create-bubbles`. This list reflects the CLI configuration and template directories in the current repository.

## Built-in CLI Templates

| Template                                                           | Current stack and contents                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [vue-vp-eslint](/en/templates/vue-vite-eslint)                     | Vue 3, Vite+, ESLint, Antdv Next, Pinia, and UnoCSS.                                                                           |
| [vp-vue-eslint-vapor](/en/templates/vp-vue-eslint-vapor)           | Vue 3.6 RC, Vapor mode, Vite+, Antdv Next, Pinia, and UnoCSS.                                                                  |
| [react-rsbuild-biome](/en/templates/react-rsbuild-biome)           | React 19, Rsbuild, Biome, Ant Design, and Alova.                                                                               |
| [vp-react](/en/templates/vp-react)                                 | React 19, Vite+, Ant Design, React Router, Tailwind CSS, and Alova.                                                            |
| [vp-react-shadcn](/en/templates/vp-react-shadcn)                   | React 19, Vite+, shadcn, Radix UI, Tailwind CSS, Sonner, and Zustand.                                                          |
| [vp-monorepo-react-nestjs](/en/templates/vp-monorepo-react-nestjs) | React and Vue frontends, a NestJS / Fastify backend, PostgreSQL, Redis, BullMQ, MinIO, shared code, and localization packages. |
| [taro-vue-eslint](/en/templates/taro-vue-eslint)                   | Taro 4.2, Vue 3.5, NutUI, UnoCSS, and Alova for mini-programs and H5.                                                          |
| [taro-react-oxc](/en/templates/taro-react-oxc)                     | Taro 4.2, React 18, NutUI React Taro, Tailwind CSS, Oxlint, and Oxfmt.                                                         |
| [nextjs-vinext-eslint](/en/templates/nextjs-vinext-eslint)         | Next.js 16, React 19, Vinext, ESLint, and Ant Design.                                                                          |

Choose a template interactively or provide its name:

```bash
pnpm create bubbles@latest my-project --template vue-vp-eslint
```

## Electron Desktop Projects

The **Others → Electron** CLI entry delegates to the external `create-electron-vite` scaffolder. Its own prompts determine the framework and generated configuration. The CLI option is named `create-eletron-vite`, matching the current source spelling.

```bash
pnpm create bubbles@latest my-desktop --template create-eletron-vite
```

See the [Electron setup guide](/en/templates/create-eletron-vite).

## Choosing a Template

- **Vue apps**: use `vue-vp-eslint`, or choose `vp-vue-eslint-vapor` to evaluate Vapor mode.
- **React apps**: use `vp-react` or `vp-react-shadcn` with Vite+, or `react-rsbuild-biome` for Rsbuild and Biome.
- **Full-stack projects**: choose `vp-monorepo-react-nestjs`, start the React or Vue frontend you need, and configure the backend services.
- **Mini-programs / H5**: select the Taro template matching Vue or React.
- **Next.js-style apps**: choose `nextjs-vinext-eslint` and follow its startup and compatibility notes.
- **Desktop apps**: use the Electron entry to launch the upstream scaffolder.

Runtime, package manager, and startup requirements differ between templates. Follow the corresponding template page to complete setup.
