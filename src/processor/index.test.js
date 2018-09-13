import EventEmitter from 'eventemitter3'
import Log from 'logarama'

import createBlockProcessor from './'

describe('blockchain processor', () => {
  let blockChain
  let db

  beforeEach(async () => {
    const log = new Log({ minLevel: 'warn' })

    blockChain = new EventEmitter()

    db = null

    await createBlockProcessor(
      null, log, blockChain, db
    )
  })

  it('puts new parties into the database', () => {

  })
})
