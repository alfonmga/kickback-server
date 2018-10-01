const { isEmail } = require('validator')
const { isAddress } = require('web3-utils')
const safeGet = require('lodash.get')

const { TERMS_AND_CONDITIONS, PRIVACY_POLICY } = require('../constants/legal')

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

exports.hasAcceptedLegalAgreements = (legal = []) => {
  const terms = legal.find(l => l.type === TERMS_AND_CONDITIONS)
  const privacy = legal.find(p => p.type === PRIVACY_POLICY)

  return (safeGet(terms, 'accepted') && safeGet(privacy, 'accepted'))
}

exports.stringsMatchIgnoreCase = (a1, a2) => (typeof a1 === 'string') && (typeof a2 === 'string') && a1.toLowerCase() === a2.toLowerCase()

exports.addressesMatch = exports.stringsMatchIgnoreCase
