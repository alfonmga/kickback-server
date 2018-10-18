exports.removeUndefinedValuesFromObject = props => {
  Object.keys(props).forEach(key => {
    if (undefined === props[key]) {
      delete props[key]
    }
  })

  return props
}
