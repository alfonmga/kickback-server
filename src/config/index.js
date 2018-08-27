const envalid = require('envalid')

const { str, bool, num } = envalid

const env = envalid.cleanEnv(process.env, {
  PORT: num({ default: 3001 }),
  DEBUG: bool({ default: false }),
  NODE_ENV: str({ default: 'development' }),
  APP_MODE: str({ default: 'local' }),
  LOG: str({ default: 'debug' }),
  OVERLORD_CONTRACT_ADDRESS: str()
}, {
  dotEnvPath: '.env'
})



// eslint-disable-next-line import/no-dynamic-require
const props = require(`./${env.APP_MODE}`)

module.exports = {
  env,
  ...props
}
