const config = require('kcd-scripts/config').lintStaged

const newConfig = {}
for (const [key, value] of Object.entries(config)) {
  if (Array.isArray(value)) {
    newConfig[key] = value.map(v =>
      v.includes('kcd-scripts test') ? 'npm test -- --no-watch' : v,
    )
  } else {
    newConfig[key] = value
  }
}

module.exports = newConfig
