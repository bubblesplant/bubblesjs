import { PageContainer, ProCard } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import { Alert, Collapse, Segmented, Space, Switch, Typography } from 'antd'
import SelectorExampleForm from './components/SelectorExampleForm/SelectorExampleForm'
import type { SelectorExampleScope } from './config/types'
import styles from './index.module.css'

const usage = `import { ProForm, ProFormItem } from '@ant-design/pro-components'
import {
  GlobalAccountSelect, OrganizationMemberSelect, RoleSelect,
  OrganizationSelect, PositionSelect,
} from '@/components/Selector'

<ProForm initialValues={{ accountIds: ['demo-user-1'] }}
  onFinish={async (values) => { console.log(values) }}>
  <ProFormItem name="accountIds" label="账号">
    <GlobalAccountSelect multiple={false} request={searchAccounts} resolve={resolveAccounts}
      onChange={(ids, records) => console.log(ids, records)} />
  </ProFormItem>
  <ProFormItem name="memberIds" label="成员">
    <OrganizationMemberSelect multiple candidateContextKey="company:demo"
      scope={{ type: 'company' }} request={searchMembers} resolve={resolveMembers}
      onChange={(ids, records) => console.log(ids, records)} />
  </ProFormItem>
  <ProFormItem name="roleIds" label="角色">
    <RoleSelect multiple={false} roles={roles}
      onChange={(ids, records) => console.log(ids, records)} />
  </ProFormItem>
  <ProFormItem name="organizationIds" label="纯组织">
    <OrganizationSelect multiple units={units}
      onChange={(ids, records) => console.log(ids, records)} />
  </ProFormItem>
  <ProFormItem name="organizationRelations" label="组织与职责">
    <OrganizationSelect multiple={false} units={units} enableDuties
      onChange={(relations, records) => console.log(relations, records)} />
  </ProFormItem>
  <ProFormItem name="positionIds" label="岗位">
    <PositionSelect multiple positions={positions}
      onChange={(ids, records) => console.log(ids, records)} />
  </ProFormItem>
</ProForm>`

/** 展示公共选择器在企业／项目表单中的完整用法，候选及提交仅保存在页面内。 */
export default function SelectorExamplePage() {
  const { tr } = useI18n()
  const [scopeType, setScopeType] = useState<SelectorExampleScope>('company')
  const [disabled, setDisabled] = useState(false)
  const [multiple, setMultiple] = useState(true)
  return (
    <PageContainer
      title={tr('选择器示例')}
      content={tr('账号、成员、角色、组织、岗位直接接入 ProFormItem。')}
    >
      <div className={styles.page}>
        <Alert type="info" showIcon title={tr('使用虚构候选数据，提交结果仅在本页展示。')} />
        <ProCard variant="outlined">
          <Space size="large" wrap>
            <Space>
              <Typography.Text>{tr('作用域')}</Typography.Text>
              <Segmented<SelectorExampleScope>
                value={scopeType}
                onChange={setScopeType}
                options={[
                  { value: 'company', label: tr('企业级') },
                  { value: 'project', label: tr('项目级') },
                ]}
              />
            </Space>
            <Space>
              <Typography.Text>{tr('选择模式')}</Typography.Text>
              <Segmented
                aria-label={tr('选择模式')}
                value={multiple ? 'multiple' : 'single'}
                onChange={(mode) => setMultiple(mode === 'multiple')}
                options={[
                  { value: 'single', label: tr('单选') },
                  { value: 'multiple', label: tr('多选') },
                ]}
              />
            </Space>
            <Space>
              <Switch id="selector-disabled" checked={disabled} onChange={setDisabled} />
              <label htmlFor="selector-disabled">{tr('禁用表单')}</label>
            </Space>
          </Space>
        </ProCard>
        <SelectorExampleForm
          key={`${scopeType}:${multiple}`}
          scopeType={scopeType}
          multiple={multiple}
          disabled={disabled}
        />
        <Collapse
          items={[
            {
              key: 'usage',
              label: tr('接入代码'),
              children: <pre className={styles.code}>{usage}</pre>,
            },
          ]}
        />
      </div>
    </PageContainer>
  )
}
