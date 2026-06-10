module.exports = {
  plugins: {
    ...(process.env.TARO_ENV === 'h5' ? { '@tailwindcss/postcss': {} } : {}),
    autoprefixer: {}
  }
}
