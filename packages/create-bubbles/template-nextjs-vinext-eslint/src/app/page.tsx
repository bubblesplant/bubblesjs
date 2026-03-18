import Header from './_components/Header/header'
import Main from './_components/Main'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  'address': {
    '@type': 'PostalAddress',
    'addressCountry': 'CN',
    'addressLocality': '重庆市',
    'addressRegion': '渝北区',
    'streetAddress': '心大国际A东3F',
  },
  'alternateName': '蜜蜂数联',
  'contactPoint': {
    '@type': 'ContactPoint',
    'areaServed': 'CN',
    'availableLanguage': 'zh-CN',
    'contactType': 'customer service',
    'email': 'mifengshulian@qq.com',
    'telephone': '+86-189-8396-6934',
  },
  'description':
    '蜜蜂数联（重庆）智能科技有限公司，专注工程管理数字化解决方案、数字孪生运维解决方案及AI+医疗领域，为政企客户提供全方位产业数字化转型服务。',
  'logo': 'https://www.mifengshulian.com/logo.svg',
  'name': '蜜蜂数联（重庆）智能科技有限公司',
  'sameAs': [],
  'url': 'https://www.mifengshulian.com',
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Header />
      <Main />
    </>
  )
}
