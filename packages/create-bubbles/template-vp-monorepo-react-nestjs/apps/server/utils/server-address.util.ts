import { Logger } from '@nestjs/common'
import { networkInterfaces } from 'node:os'

export interface ServerAddressOptions {
  port: number
  host?: string
  protocol?: string
  env?: string
}

export class ServerAddressPrinter {
  private static readonly logger = new Logger(ServerAddressPrinter.name)

  static print(options: ServerAddressOptions): void {
    const host = options.host ?? 'localhost'
    const protocol = options.protocol ?? 'http'
    const env = options.env ?? process.env.NODE_ENV ?? 'development'
    const localHost = this.isAnyHost(host) ? 'localhost' : host
    const localUrl = this.createUrl(protocol, localHost, options.port)
    const networkUrls = this.isAnyHost(host) ? this.getNetworkUrls(protocol, options.port) : []

    const addresses = [
      { label: '本地地址', url: localUrl },
      ...networkUrls.map((url, index) => ({
        label: networkUrls.length > 1 ? `局域网地址 ${index + 1}` : '局域网地址',
        url,
      })),
    ]
    const labelWidth = Math.max(...addresses.map(({ label }) => label.length))

    this.logger.log(
      [
        '',
        `服务已启动，当前环境：${env}`,
        ...addresses.map(({ label, url }) => `  ${label.padEnd(labelWidth)}：${url}`),
        '',
        '提示：按住 Ctrl 点击地址可快速打开。',
      ].join('\n'),
    )
  }

  private static getNetworkUrls(protocol: string, port: number): string[] {
    const interfaces = networkInterfaces()
    const addresses = Object.values(interfaces)
      .flatMap((details) => details ?? [])
      .filter((detail) => detail.family === 'IPv4')
      .filter((detail) => !detail.internal)
      .map((detail) => this.createUrl(protocol, detail.address, port))

    return Array.from(new Set(addresses))
  }

  private static createUrl(protocol: string, host: string, port: number): string {
    const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host

    return `${protocol}://${normalizedHost}:${port}/`
  }

  private static isAnyHost(host: string): boolean {
    return ['0.0.0.0', '::', '[::]'].includes(host)
  }
}
