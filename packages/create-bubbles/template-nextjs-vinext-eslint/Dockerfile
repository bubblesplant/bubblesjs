# nodejs 版本
FROM node:24-alpine

# 使用pnpm 
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json 并安装依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

ENV PORT=9980
EXPOSE 9980

CMD ["pnpm", "start"]
