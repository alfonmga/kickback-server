# BlockParty backend server

* Development deployment: https://dev.server.noblockno.party [![Build Status](https://travis-ci.org/noblocknoparty/server.svg?branch=dev)](https://travis-ci.org/noblocknoparty/server)
* Production deployment: https://live.server.noblockno.party [![Build Status](https://travis-ci.org/noblocknoparty/server.svg?branch=master)](https://travis-ci.org/noblocknoparty/server)

Google Firestore is used as the backend storage, with separate storage databases for dev and live.

More info on server is available [in the docs](https://github.com/noblocknoparty/docs/blob/master/BackendServer.md).

## Branches

* `dev` - Default branch, where latest development takes place
* `master` - Production branch

## Running

Pre-requisites:
  * Node 8.11.4
  * Yarn

**Create .env file**

Create a `.env` file in your project root. This gets auto-loaded at startup by
the server and provides a convenient way of setting environment variables.
In our server deployments we auto-create this file.

The server has 3 running modes (can be set using the `APP_MODE` var in `.env` file):

  * `local` (default) - _server connects to local test network_
  * `development` - _server connects to Ropsten network on Infura_
  * `production` - _server connects to Mainnet on Infura_

**Setup Firestore database credentials**

The Google Cloud JSON config files in `.googlecloud/` need to be decrypted using
the commands:

```shell
openssl aes-256-cbc -K $CONFIG_ENCRYPTION_KEY -iv $CONFIG_ENCRYPTION_IV -in .googlecloud/dev.json.enc -out .googlecloud/dev.json -d
openssl aes-256-cbc -K $CONFIG_ENCRYPTION_KEY -iv $CONFIG_ENCRYPTION_IV -in .googlecloud/dev.production.enc -out .googlecloud/production.json -d
```

_The env vars `CONFIG_ENCRYPTION_KEY` and `CONFIG_ENCRYPTION_IV` can be found in our password vault_.

**Deploy contracts to local test network and create .env file**

Clone our [contracts repo](https://github.com/noblocknoparty/contracts) and follow the instructions to deploy the
contracts to a local test network. The network RPC endpoint should match what's
in `src/config/local.js` in this repo.

Find the deployed address of the `Deployer` contract and enter it the `.env` file:

```
DEPLOYER_CONTRACT_ADDRESS=<...address...>
```

**Run server**

Now you can run the server:

```shell
$ yarn start
```

**Test contract deployment and interaction**

Clone our [frontend repo](https://github.com/noblocknoparty/app) and use it to test out the contracts.


## Deployments

On CI we deploy to Zeit using [now](https://zeit.co/docs/getting-started/five-minute-guide-to-now).

To use the same commands locally you will need to set the `NOW_TOKEN` environment
variable to your access token obtained from https://zeit.co/account/tokens.

To deploy and alias the dev server URL in one go:

**Dev server deployment**

```shell
$ yarn deploy:dev
```

To deploy and alias our dev domain all in one go:

```shell
$ yarn release:dev
```

### Production

```shell
$ yarn deploy:production
```
To deploy and alias the production server URL in one go:

```shell
$ yarn release:prod
```
