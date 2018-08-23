const Koa = require('koa')
const cors = require('@koa/cors')
const Router = require('koa-router')
const next = require('next')
const Firestore = require('@google-cloud/firestore')

const { FIREBASE } = require('./constants')

const {
  PORT,
  DEBUG,
  NODE_ENV,
  FIREBASE_API_KEY,
  FIREBASE_MSG_SENDER_ID,
  COUCHDB_PASSWORD,
  MODE
} = process.env

const port = parseInt(PORT, 10) || 3001

const mode = (MODE !== 'production') ? 'development' : MODE

const app = next({ dev: NODE_ENV !== 'production' })

const handle = app.getRequestHandler()

const firestore = new Firestore({
  /* These values come from the Google cloud console */
  projectId: FIREBASE[mode].projectId,
  /* This file should NOT be checked into version control */
  keyFilename: FIREBASE[mode].configPath
})

app.prepare()
  .then(() => {
    const server = new Koa()
    const router = new Router()

    server.use(cors({
      origin: true,
      credentials: true,
    }))

    router.get('*', async ctx => {
      await handle(ctx.req, ctx.res)
      ctx.respond = false
    })

    server.use(async (ctx, next) => {
      // Koa doesn't seems to set the default statusCode.
      // So, this middleware does that
      ctx.res.statusCode = 200
      await next()
    })

    server.use(router.routes())

    server.listen(port, (err) => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  })
