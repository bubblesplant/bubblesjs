import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import styles from './AffiliationPicker.module.css'

/** 为组织与岗位提供固定双栏布局，已选标签在独立容器内换行和滚动。 */
export default function AffiliationPicker({
  children,
  listTitle,
  selectionTitle,
  emptyText,
  removeLabel,
  items,
  selectedIds,
  disabled,
  onChange,
}: {
  children: ReactNode
  listTitle: string
  selectionTitle: string
  emptyText: string
  removeLabel: (label: string) => string
  items: Array<{ id: string; label: string }>
  selectedIds: string[]
  disabled: boolean
  onChange: (ids: string[]) => void
}) {
  const { tr } = useI18n()
  const labels = new Map(items.map((item) => [item.id, item.label]))

  return (
    <div className={styles.layout}>
      <section className={styles.tablePanel} aria-label={listTitle}>
        {children}
      </section>
      <section className={styles.selectionPanel} aria-label={selectionTitle}>
        <div className={styles.selectionHeader}>
          <div className={styles.selectionHeading}>
            <span>{selectionTitle}</span>
            <span
              className={styles.selectionCount}
              aria-label={tr('已选择 {count} 项', { count: selectedIds.length })}
            >
              {selectedIds.length}
            </span>
          </div>
          <Button
            type="link"
            size="small"
            className={styles.clearButton}
            aria-label={tr('清空选择')}
            disabled={disabled || !selectedIds.length}
            onClick={() => onChange([])}
          >
            {tr('清空')}
          </Button>
        </div>
        <div className={styles.selectedItems}>
          {selectedIds.length ? (
            selectedIds.map((id) => {
              const label = labels.get(id) ?? id
              return (
                <div key={id} className={styles.selectedItem}>
                  <span className={styles.selectedItemContent} title={label}>
                    {label}
                  </span>
                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={removeLabel(label)}
                    disabled={disabled}
                    onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== id))}
                  >
                    <CloseOutlined />
                  </button>
                </div>
              )
            })
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <PlusOutlined />
              </span>
              <span>{emptyText}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
