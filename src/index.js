const Koa = require('koa')
const cors = require('@koa/cors')
const Router = require('koa-router')
const next = require('next')

const config = require('./config')
const setupEventQueue = require('./eventQueue')
const setupScheduler = require('./scheduler')
const log = require('./log')(config)
const connectDb = require('./db')
const connectEthereum = require('./ethereum')
const createProcessor = require('./processor')

const init = async () => {
  const app = next({ dev: config.env.isDev })

  const handle = app.getRequestHandler()

  log.info(`App mode: ${config.env.APP_MODE}`)

  const db = connectDb({ config, log })
  if (!db) {
    throw new Error('Database could not be connected')
  }

  const eventQueue = setupEventQueue({ log })
  const scheduler = setupScheduler({ log, eventQueue })
  const blockChain = await connectEthereum({ config, log, db })
  await createProcessor({ config, log, scheduler, db, blockChain })

  const server = new Koa()
  const router = new Router()

  await app.prepare()

  server.use(cors({
    origin: true,
    credentials: true,
  }))

  router.get('*', async ctx => {
    await handle(ctx.req, ctx.res)
    ctx.respond = false
  })

  server.use(async (ctx, nextHandler) => {
    // Koa doesn't seems to set the default statusCode.
    // So, this middleware does that
    ctx.res.statusCode = 200
    await nextHandler()
  })

  server.use(router.routes())

  server.listen(config.env.PORT, err => {
    if (err) {
      throw err
    }

    log.info(`> Ready on http://localhost:${config.env.PORT}`)
  })
}

init().catch(err => {
  log.error(err)
  process.exit(-1)
})
