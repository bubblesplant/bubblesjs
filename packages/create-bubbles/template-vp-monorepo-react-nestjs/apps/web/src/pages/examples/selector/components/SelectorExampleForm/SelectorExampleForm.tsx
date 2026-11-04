import { ProCard, ProForm, ProFormItem } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import { Button, Form, Space, Tabs, Typography } from 'antd'
import {
  GlobalAccountSelect,
  OrganizationMemberSelect,
  OrganizationSelect,
  PositionSelect,
  RoleSelect,
} from '@/components/Selector'
import { createEmptySelectorValues, createSelectorExampleData } from '../../config/data'
import { createSelectorExampleRequests } from '../../config/requests'
import type {
  SelectorExampleChanges,
  SelectorExampleRecords,
  SelectorExampleScope,
  SelectorExampleValues,
} from '../../config/types'
import styles from '../../index.module.css'

/** 接入公共字段并分别展示表单数组值、真实两参数回调和最近一次有效提交。 */
export default function SelectorExampleForm({
  scopeType,
  multiple,
  disabled,
}: {
  scopeType: SelectorExampleScope
  multiple: boolean
  disabled: boolean
}) {
  const { tr } = useI18n()
  const [form] = Form.useForm<SelectorExampleValues>()
  const data = useMemo(() => createSelectorExampleData(scopeType), [scopeType])
  const requests = useMemo(() => createSelectorExampleRequests(data), [data])
  const initialValues = useMemo(
    () => ({
      ...data.initialValues,
      memberIds: multiple ? data.initialValues.memberIds : data.initialValues.memberIds.slice(0, 1),
    }),
    [data, multiple],
  )
  const values = Form.useWatch([], form)
  const [submitted, setSubmitted] = useState<SelectorExampleValues>()
  const [changes, setChanges] = useState<SelectorExampleChanges>({})
  const required = [{ required: true, message: tr('请选择至少一项') }]
  const memberProps = {
    candidateContextKey: `selector-example:${scopeType}`,
    scope: { type: scopeType, label: data.scopeName },
    request: requests.memberRequest,
    resolve: requests.memberResolve,
    disabled,
    multiple,
  }

  /** 以独立快照记录真实回调，避免后续候选或表单更新修改历史结果。 */
  const recordChange = <Field extends keyof SelectorExampleValues>(
    field: Field,
    next: SelectorExampleValues[Field],
    records: SelectorExampleRecords[Field],
  ) => {
    setChanges((current) => ({
      ...current,
      [field]: structuredClone({ values: next, records }),
    }))
  }

  return (
    <div className={styles.grid}>
      <ProCard title={tr('表单示例')} variant="outlined">
        <ProForm<SelectorExampleValues>
          form={form}
          name="selector-example"
          layout="vertical"
          initialValues={initialValues}
          disabled={disabled}
          onFinish={async (next) => {
            setSubmitted(structuredClone(next))
            return true
          }}
          onReset={() => {
            setSubmitted(undefined)
            setChanges({})
          }}
          submitter={{ searchConfig: { submitText: tr('提交表单'), resetText: tr('重置表单') } }}
        >
          <div className={styles.fields}>
            <ProFormItem name="accountIds" label={tr('账号')} rules={required}>
              <GlobalAccountSelect
                multiple={multiple}
                request={requests.accountRequest}
                resolve={requests.accountResolve}
                disabled={disabled}
                onChange={(ids, records) => recordChange('accountIds', ids, records)}
              />
            </ProFormItem>
            <ProFormItem name="memberIds" label={tr('成员')} rules={required}>
              <OrganizationMemberSelect
                {...memberProps}
                onChange={(ids, records) => recordChange('memberIds', ids, records)}
              />
            </ProFormItem>
            <ProFormItem name="roleIds" label={tr('角色')} rules={required}>
              <RoleSelect
                multiple={multiple}
                roles={data.roles}
                disabled={disabled}
                onChange={(ids, records) => recordChange('roleIds', ids, records)}
              />
            </ProFormItem>
            <ProFormItem name="organizationIds" label={tr('组织（纯组织）')} rules={required}>
              <OrganizationSelect
                multiple={multiple}
                units={data.units}
                disabled={disabled}
                onChange={(ids, records) => recordChange('organizationIds', ids, records)}
              />
            </ProFormItem>
            <ProFormItem name="organizationRelations" label={tr('组织与职责')} rules={required}>
              <OrganizationSelect
                multiple={multiple}
                units={data.units}
                enableDuties
                disabled={disabled}
                onChange={(relations, records) =>
                  recordChange('organizationRelations', relations, records)
                }
              />
            </ProFormItem>
            <ProFormItem name="positionIds" label={tr('岗位')} rules={required}>
              <PositionSelect
                multiple={multiple}
                positions={data.positions}
                disabled={disabled}
                onChange={(ids, records) => recordChange('positionIds', ids, records)}
              />
            </ProFormItem>
          </div>
          <Space wrap className={styles.actions}>
            <Button
              disabled={disabled}
              onClick={() => {
                form.setFieldsValue(initialValues)
                setChanges({})
              }}
            >
              {tr('填入示例')}
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                form.setFieldsValue(createEmptySelectorValues())
                setChanges({})
              }}
            >
              {tr('清空字段')}
            </Button>
          </Space>
        </ProForm>
      </ProCard>
      <ProCard title={tr('字段值与提交结果')} variant="outlined">
        <Tabs
          items={[
            {
              key: 'current',
              label: tr('表单当前值'),
              children: (
                <pre className={styles.json} data-testid="selector-current">
                  {JSON.stringify(values ?? initialValues, null, 2)}
                </pre>
              ),
            },
            {
              key: 'records',
              label: tr('选择回调'),
              children: (
                <>
                  <Typography.Paragraph type="secondary">
                    {tr('确认、移除或清空后，查看 onChange(values, records) 的实际输出。')}
                  </Typography.Paragraph>
                  <pre className={styles.json} data-testid="selector-records">
                    {JSON.stringify(changes, null, 2)}
                  </pre>
                </>
              ),
            },
            {
              key: 'submitted',
              label: tr('最近提交结果'),
              children: submitted ? (
                <pre className={styles.json} data-testid="selector-submitted">
                  {JSON.stringify(submitted, null, 2)}
                </pre>
              ) : (
                <Typography.Text type="secondary">{tr('点击提交表单后查看结果')}</Typography.Text>
              ),
            },
          ]}
        />
        <Typography.Paragraph type="secondary" className={styles.hint}>
          {tr('单选和多选始终返回数组，清空为 []；开启职责后返回组织 ID 与职责数组。')}
          <br />
          {tr('表单保存第一个参数；第二个参数为候选接口实际返回的完整记录数组。')}
        </Typography.Paragraph>
      </ProCard>
    </div>
  )
}
