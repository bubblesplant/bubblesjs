import type { SvgIconProps } from '../svg-icon/SvgIcon'
import SvgIcon from '../svg-icon/SvgIcon'
import { resolveSvgAsset } from './SvgAssetRegistry'

export interface SvgAssetIconProps extends Omit<SvgIconProps, 'icon'> {
  /** 菜单图标 key，缺失或不存在时使用缺省图标。 */
  name?: string
}

/** 将本地 SVG 资源按稳定 key 渲染为可继承外部大小和颜色的图标。 */
export default function SvgAssetIcon({ name, ...props }: SvgAssetIconProps) {
  const asset = resolveSvgAsset(name)
  return <SvgIcon icon={asset.component} {...props} data-icon-key={asset.key} />
}
