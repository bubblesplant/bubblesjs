import { ProTable, type ParamsType, type ProTableProps } from '@ant-design/pro-components'
import classNames from 'classnames'
import styles from './FullHeightProTable.module.css'

export type FullHeightProTableProps<
  DataType extends object,
  Params extends ParamsType = ParamsType,
  ValueType = 'text',
> = ProTableProps<DataType, Params, ValueType>

/**
 * 父容器需有明确高度，例如 h-full；位于 flex 布局时还需 min-h-0。
 * 默认使用 ProTable 原生 scroll.y 固定表头，表体占据剩余高度并独立滚动。
 * 搜索标签默认按内容自适应宽度，避免多语言长标签遮挡；页面可覆盖搜索配置。
 */
export default function FullHeightProTable<
  DataType extends object,
  Params extends ParamsType = ParamsType,
  ValueType = 'text',
>({
  className,
  cardProps,
  tableClassName,
  scroll,
  search,
  ...props
}: FullHeightProTableProps<DataType, Params, ValueType>) {
  return (
    <div className="w-full h-full p-[16px]">
      <ProTable<DataType, Params, ValueType>
        {...props}
        className={classNames(styles.proTable, className)}
        cardProps={
          cardProps === false
            ? false
            : { ...cardProps, className: classNames(styles.tableCard, cardProps?.className) }
        }
        tableClassName={classNames(styles.table, tableClassName)}
        scroll={{ x: 'max-content', y: 'auto', ...scroll }}
        search={search === false ? false : { labelWidth: 'auto', ...search }}
      />
    </div>
  )
}
