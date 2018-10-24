const Koa = require('koa')
const cors = require('@koa/cors')
const Router = require('koa-router')
const next = require('next')

const config = require('./config')
const setupEventQueue = require('./eventQueue')
const log = require('./log')(config)
const connectDb = require('./db')
const connectEthereum = require('./ethereum')
const createProcessor = require('./processor')
const setupGraphQLEndpoint = require('./graphql')
const setupAuthMiddleware = require('./auth')

const init = async () => {
  const app = next({ dev: config.NODE_ENV === 'development' })

  const handle = app.getRequestHandler()

  log.info(`App mode: ${config.APP_MODE}`)

  const blockChain = await connectEthereum({ config, log })
  const db = await connectDb({ config, log, blockChain })
  const eventQueue = setupEventQueue({ log })
  await createProcessor({ config, log, eventQueue, db, blockChain })

  const server = new Koa()
  const router = new Router()

  await app.prepare()

  server.use(cors({
    origin: '*',
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

  setupAuthMiddleware({ log, db, server, blockChain })
  setupGraphQLEndpoint({ config, db, server, blockChain })

  server.use(router.routes())

  server.listen(config.PORT, err => {
    if (err) {
      throw err
    }

    log.info(`> Ready on http://localhost:${config.PORT}`)
  })
}

init().catch(err => {
  log.error(err)
  process.exit(-1)
})
