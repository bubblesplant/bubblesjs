# vue-components-starter

A starter for creating a Vue component library.

## Development

- Install dependencies:

```bash
npm install
```

- Run the playground:

```bash
npm run playground
```

- Run the unit tests:

```bash
npm run test
```

- Build the library:

```bash
npm run build
```

### 额外依赖

@flatten-js/interval-tree
区间树查询，用来查询一个区间是否与其他区间重叠

grapheme-splitter 用来分割unicode
'👨‍👩‍👧‍👦'.split('') // 拆成乱码
'你好🎉'.split('') // ['你', '好', '�', '�']
