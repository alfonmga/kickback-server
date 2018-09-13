#!/usr/bin/env node

/* This script deploys a new party using the Deployer (useful for testing event watching) */

const Web3 = require('web3')
const { toHex, toWei } = require('web3-utils')
const { Deployer, events: { NewParty } } = require('@noblocknoparty/contracts')

const config = require('../src/config')
const { getContract } = require('../src/ethereum/utils')

async function init () {
  const web3 = new Web3(new Web3.providers.HttpProvider(config.ETHEREUM_ENDPOINT_RPC))

  const [ account ] = await web3.eth.getAccounts()

  console.log(`Account: ${account}`)

  const contractInstance =
    await getContract(Deployer, web3).at(config.env.DEPLOYER_CONTRACT_ADDRESS)

  const { logs } = await contractInstance.deploy(
    'test',
    toHex(toWei('0.02')),
    toHex(2),
    toHex(60 * 60 * 24 * 7),
    'encKey',
    { from: account }
  )

  const e = logs.find(({ event }) => event === NewParty.name)

  console.log(`Party deployed at: ${e.args.deployedAddress}`)
}

init().catch(err => {
  console.error(err)
  process.exit(-1)
})
