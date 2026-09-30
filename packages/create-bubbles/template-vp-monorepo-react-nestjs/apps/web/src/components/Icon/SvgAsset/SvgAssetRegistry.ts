type SvgAssetComponent = ComponentType<SVGProps<SVGSVGElement>>

const assetModules = import.meta.glob<SvgAssetComponent>('/src/assets/svg/**/*.svg', {
  eager: true,
  import: 'default',
  query: '?react',
})

const assetRoot = '/src/assets/svg/'

/** 将 Vite glob 返回的绝对资源路径转换为稳定的菜单图标 key。 */
function assetKey(path: string): string {
  return path.slice(assetRoot.length, -'.svg'.length)
}

export interface SvgAssetDefinition {
  key: string
  component: SvgAssetComponent
}

export const svgAssets: readonly SvgAssetDefinition[] = Object.entries(assetModules)
  .map(([path, component]) => ({ key: assetKey(path), component }))
  .sort((left, right) => left.key.localeCompare(right.key))

const assetsByKey = new Map(svgAssets.map((asset) => [asset.key, asset]))

export const DEFAULT_MENU_ICON_KEY = 'menu-item'

/** 按菜单图标 key 解析资源；未知值回退到统一缺省图标。 */
export function resolveSvgAsset(key?: string): SvgAssetDefinition {
  return assetsByKey.get(key ?? '') ?? assetsByKey.get(DEFAULT_MENU_ICON_KEY)!
}
