const { isEmail } = require('validator')
const { isAddress } = require('web3-utils')

exports.assertEmail = email => {
  if (!isEmail(email)) {
    throw new Error(`Invalid email: ${email}`)
  }
}

exports.assertEthereumAddress = addr => {
  if (!isAddress(addr)) {
    throw new Error(`Invalid Ethereum address: ${addr}`)
  }
}
