const path = require('path')

module.exports = {
  FIREBASE: {
    development: {
      projectId: 'blockparty-dev-214214',
      configPath: path.join(__dirname, '..', '.googlecloud', 'dev.json'),
    },
    production: {
      projectId: 'blockparty-live',
      configPath: path.join(__dirname, '..', '.googlecloud', 'production.json'),
    },
  }
}
