const envalid = require('envalid')

const { str, bool, num } = envalid

const env = envalid.cleanEnv(process.env, {
  PORT: num({ default: 3001 }),
  DEBUG: bool({ default: false }),
  NODE_ENV: str({ default: 'development' }),
  APP_MODE: str({ default: 'local' }),
  LOG: str({ default: 'debug' }),
  DEPLOYER_CONTRACT_ADDRESS: str()
}, {
  dotEnvPath: '.env'
})


module.exports = {
  env,
  // eslint-disable-next-line import/no-dynamic-require
  ...require(`./${env.APP_MODE}`),
}
