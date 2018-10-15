const envalid = require('envalid')

const { str, bool, num } = envalid

const env = envalid.cleanEnv(process.env, {
  PORT: num({ default: 3001 }),
  DEBUG: bool({ default: false }),
  NODE_ENV: str({ default: 'development' }),
  APP_MODE: str({ default: 'local' }),
  LOG: str({ default: 'debug' }),
  BLOCK_CONFIRMATIONS: num({ default: 0 }),
  ACTIVECHECK_TIMER_DELAY: num({ default: 120000 }),
  NODE_RECONNECT_DELAY: num({ default: 10000 }),
  BLOCK_RANGE: num({ default: 100 }),
  DEPLOYER_CONTRACT_ADDRESS: str({ default: '' }),
  DEPLOYER_TRANSACTION: str({ default: '' }),
  LOGDNA_API_KEY: str({ default: '' }),
  CONFIG_ENCRYPTION_IV: str(),
  CONFIG_ENCRYPTION_KEY: str()
}, {
  dotEnvPath: '.env'
})

// eslint-disable-next-line import/no-dynamic-require
const modeConfig = require(`./${env.APP_MODE}`)

module.exports = Object.freeze({
  ...env,
  ...modeConfig,
})
