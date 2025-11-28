### 全局状态

一个是对话状态  init 未开始 | first-generating 第一次生成（需要创建会话id） | generating 生成中 | wait 等待中（等待用户输入）
一个是会话id

一个是 回应loading responseLoading

一个是 currentRequest currentReason  currentResponse

### 会话数据格式
[
  {
    type:  'request',
    content: 'xxx'
  },
  {
    type: 'response',
    reason: 'xxx', // 深度思考内容
    content: 'xxx'// 回答内容
  }
]
