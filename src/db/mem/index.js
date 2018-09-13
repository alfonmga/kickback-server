class DocSnapshot {
  constructor (docRef) {
    this.docRef = docRef
  }

  get ref () {
    return this.docRef
  }

  get exists () {
    return !!(this.docRef.db[this.docRef.ref])
  }

  data () {
    return this.docRef.db[this.docRef.ref]
  }

  get (f) {
    return this.docRef.db[this.docRef.ref][f]
  }
}

class DocRef {
  constructor (memDb, ref) {
    this.db = memDb
    this.ref = ref
  }

  async create (data) {
    if (this.db.data[this.ref]) {
      throw new Error(`Doc already exists: ${this.ref}`)
    }

    this.db.data[this.ref] = data
  }

  async delete () {
    delete this.db.data[this.ref]
  }

  async get () {
    return new DocSnapshot(this)
  }

  async set (data) {
    this.db.data[this.ref] = {
      data
    }
  }

  async update (data) {
    if (this.db.data[this.ref]) {
      this.db.data[this.ref] = {
        ...this.db.data[this.ref],
        data
      }
    }

    throw new Error(`No data at path: ${this.ref}`)
  }
}

/**
 * API mirrors that of Firestore (https://cloud.google.com/nodejs/docs/reference/firestore/0.15.x/Firestore)
 */
class MemDb {
  constructor (log) {
    this.log = log.create('MemDb')
    this.data = {}
  }

  doc (ref) {
    return new DocRef(this, ref)
  }
}


module.exports = (config, log) => new MemDb(log)
