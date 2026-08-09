export interface I18nProjectConfig {
  include: readonly string[]
  exclude?: readonly string[]
  catalogs: Readonly<Record<string, string>>
}

export interface I18nConfig {
  callNames?: readonly string[]
  projects: Readonly<Record<string, I18nProjectConfig>>
  report?: string
}

export function defineConfig<const Config extends I18nConfig>(config: Config): Config {
  return config
}
