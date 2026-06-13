// # Create Bubbles 模板 Skills 映射表

// ## Skill 来源与安装命令

// | Skill | 来源仓库 | npx 安装命令 |
// |-------|---------|-------------|
// | `alova-client-usage` | alovajs/skills | `npx -y skills add alovajs/skills --agent universal --yes --copy --skill alova-client-usage` |
// | `unocss` | antfu/skills | `npx -y skills add antfu/skills --agent universal --yes --copy --skill unocss` |
// | `vue` | antfu/skills | `npx -y skills add antfu/skills --agent universal --yes --copy --skill vue` |
// | `pinia` | antfu/skills | `npx -y skills add antfu/skills --agent universal --yes --copy --skill pinia` |
// | `shadcn` | shadcn-ui/ui | `npx -y skills add shadcn-ui/ui --agent universal --yes --copy --skill shadcn` |

// ## 模板 × Skills 矩阵

// | Skill | 来源 | nextjs-vinext-eslint | react-rsbuild-biome | taro-react-oxc | taro-vue-eslint | vp-monorepo-react-nestjs | vp-react | vp-react-shadcn | vue-vite-eslint |
// |-------|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
// | `alova-client-usage` | alovajs/skills | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
// | `unocss` | antfu/skills | ✅ | ✅ | - | ✅ | - | - | - | ✅ |
// | `vue` | antfu/skills | - | - | - | ✅ | - | - | - | ✅ |
// | `pinia` | antfu/skills | - | - | - | ✅ | - | - | - | ✅ |
// | `shadcn` | shadcn-ui/ui | - | - | - | - | - | - | ✅ | - |

// ## 逐模板汇总

// | 模板 | Skills 列表 |
// |------|------------|
// | **template-nextjs-vinext-eslint** | `alova-client-usage`(alovajs)、`unocss`(antfu) |
// | **template-react-rsbuild-biome** | `alova-client-usage`(alovajs)、`unocss`(antfu) |
// | **template-taro-react-oxc** | `alova-client-usage`(alovajs) |
// | **template-taro-vue-eslint** | `alova-client-usage`(alovajs)、`unocss`(antfu)、`vue`(antfu)、`pinia`(antfu) |
// | **template-vp-monorepo-react-nestjs** | `alova-client-usage`(alovajs) |
// | **template-vp-react** | `alova-client-usage`(alovajs) |
// | **template-vp-react-shadcn** | `alova-client-usage`(alovajs)、`shadcn`(shadcn-ui) |
// | **template-vue-vite-eslint** | `alova-client-usage`(alovajs)、`unocss`(antfu)、`vue`(antfu)、`pinia`(antfu) |
