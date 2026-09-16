import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Select, Space, Tabs } from 'antd'
import type { FormInstance } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { TemplateFormValues } from './types'

/** 为新模板节点生成只在本次请求中使用的父子引用 key。 */
function createClientKey() {
  return crypto.randomUUID()
}

/** 编辑模板中的组织单元定义和独立岗位定义。 */
export default function TemplateDefinitionTabs({
  form,
}: {
  form: FormInstance<TemplateFormValues>
}) {
  const units = Form.useWatch('units', form) ?? []
  const positions = Form.useWatch('positions', form) ?? []
  const { tr } = useI18n()

  return (
    <Tabs
      items={[
        {
          key: 'units',
          label: tr('组织单元（{count}）', { count: units.length }),
          children: (
            <Form.List name="units">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => {
                    const selfKey = units[index]?.clientKey
                    const parentOptions = units
                      .filter((unit) => unit.clientKey && unit.clientKey !== selfKey)
                      .map((unit) => ({ value: unit.clientKey, label: unit.name || unit.code }))
                    return (
                      <Card
                        key={field.key}
                        size="small"
                        title={tr('组织单元 {index}', { index: index + 1 })}
                        extra={
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        }
                      >
                        <Form.Item name={[field.name, 'clientKey']} hidden>
                          <Input />
                        </Form.Item>
                        <Space align="start" wrap style={{ width: '100%' }}>
                          <Form.Item
                            name={[field.name, 'name']}
                            label={tr('名称')}
                            rules={[{ required: true, whitespace: true, min: 2, max: 100 }]}
                          >
                            <Input maxLength={100} style={{ width: 190 }} />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'code']}
                            label={tr('编码')}
                            rules={[{ required: true, pattern: /^[A-Za-z0-9_-]{2,32}$/ }]}
                          >
                            <Input maxLength={32} style={{ width: 160 }} />
                          </Form.Item>
                          <Form.Item name={[field.name, 'parentClientKey']} label={tr('父级')}>
                            <Select
                              allowClear
                              options={parentOptions}
                              placeholder={tr('顶级组织')}
                              style={{ width: 190 }}
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'sort']}
                            label={tr('排序')}
                            rules={[{ required: true }]}
                          >
                            <InputNumber
                              min={0}
                              max={999999999}
                              precision={0}
                              style={{ width: 130 }}
                            />
                          </Form.Item>
                        </Space>
                        <Form.Item name={[field.name, 'description']} label={tr('说明')}>
                          <Input maxLength={500} />
                        </Form.Item>
                      </Card>
                    )
                  })}
                  <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() =>
                      add({
                        clientKey: createClientKey(),
                        parentClientKey: null,
                        name: '',
                        code: '',
                        description: '',
                        sort: fields.length + 1,
                      })
                    }
                  >
                    {tr('添加组织单元')}
                  </Button>
                </Space>
              )}
            </Form.List>
          ),
        },
        {
          key: 'positions',
          label: tr('岗位（{count}）', { count: positions.length }),
          children: (
            <Form.List name="positions">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => (
                    <Card
                      key={field.key}
                      size="small"
                      title={tr('岗位 {index}', { index: index + 1 })}
                      extra={
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      }
                    >
                      <Space align="start" wrap>
                        <Form.Item
                          name={[field.name, 'name']}
                          label={tr('名称')}
                          rules={[{ required: true, whitespace: true, min: 2, max: 100 }]}
                        >
                          <Input maxLength={100} style={{ width: 210 }} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'code']}
                          label={tr('编码')}
                          rules={[{ required: true, pattern: /^[A-Za-z0-9_-]{2,32}$/ }]}
                        >
                          <Input maxLength={32} style={{ width: 180 }} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'status']}
                          label={tr('初始状态')}
                          rules={[{ required: true }]}
                        >
                          <Select
                            style={{ width: 140 }}
                            options={[
                              { value: 'active', label: tr('启用') },
                              { value: 'disabled', label: tr('停用') },
                            ]}
                          />
                        </Form.Item>
                      </Space>
                      <Form.Item name={[field.name, 'description']} label={tr('说明')}>
                        <Input maxLength={500} />
                      </Form.Item>
                    </Card>
                  ))}
                  <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() => add({ name: '', code: '', description: '', status: 'active' })}
                  >
                    {tr('添加岗位')}
                  </Button>
                </Space>
              )}
            </Form.List>
          ),
        },
      ]}
    />
  )
}
