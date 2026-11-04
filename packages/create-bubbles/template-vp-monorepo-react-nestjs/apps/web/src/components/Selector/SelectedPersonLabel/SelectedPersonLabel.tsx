import { Tooltip } from 'antd'
import styles from './SelectedPersonLabel.module.css'

interface SelectedPersonLabelProps {
  name: string
  account: string
}

/** 在账号与成员的已选标签中展示首字头像，并提供完整账号提示。 */
export default function SelectedPersonLabel({ name, account }: SelectedPersonLabelProps) {
  return (
    <Tooltip title={`${name} · ${account}`} styles={{ root: { pointerEvents: 'none' } }}>
      <span className={styles.label}>
        <span className={styles.avatar} aria-hidden="true">
          {Array.from(name.trim() || account)[0]}
        </span>
        <span className={styles.text}>
          {name} · {account}
        </span>
      </span>
    </Tooltip>
  )
}
