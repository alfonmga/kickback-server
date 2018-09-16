#!/usr/bin/env node

const crypto = require('crypto')
const { argv } = require('yargs')
const getStdin = require('get-stdin')

getStdin().then(plaintext => {
  const { key, iv } = argv
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const final = cipher.update(plaintext, 'utf8', 'base64') + cipher.final('base64')
  console.log(final)
})
