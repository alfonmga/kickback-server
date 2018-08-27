const Log = require('logarama')

module.exports = config => new Log({ minLevel: config.env.LOG })
