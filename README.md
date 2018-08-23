[![Build Status](https://travis-ci.org/noblocknoparty/server.svg?branch=master)](https://travis-ci.org/noblocknoparty/server)

# BlockParty backend server

* Development deployment: https://dev.noblockno.party (in-memory db)
* Production deployment: https://live.noblockno.party (persisted db)

Google Firestore is used as the backend storage.

## Branches

* `dev` - Default branch, where latest development takes place, deployed to https://dev.noblockno.party
* `master` - Production branch, deployed to https://live.noblockno.party

## Running

Pre-requisites:
  * Node 8.11.4
  * Yarn

The server has two running modes: `development` (default) and `production`. These are
set using the `NODE_ENV` environment variable.

The Google Cloud JSON config files in `.googlecloud/` need to be decrypted using
the commands:

```shell
openssl aes-256-cbc -K $CONFIG_ENCRYPTION_KEY -iv $CONFIG_ENCRYPTION_IV -in .googlecloud/dev.json.enc -out .googlecloud/dev.json -d
openssl aes-256-cbc -K $CONFIG_ENCRYPTION_KEY -iv $CONFIG_ENCRYPTION_IV -in .googlecloud/dev.production.enc -out .googlecloud/production.json -d
```

_The env var `CONFIG_ENCRYPTION_KEY` value can be found in our password vault_.

Now you can run the server:

```shell
$ yarn start
```

To run in production mode, do:

```shell
$ MODE=production yarn start
```

## Deployments

On CI we deploy to Zeit using [now](https://zeit.co/docs/getting-started/five-minute-guide-to-now).

To use the same commands locally you will need to set the `NOW_TOKEN` environment
variable to your access token obtained from https://zeit.co/account/tokens.

### Development

```shell
$ yarn deploy:dev
```

### Production

```shell
$ yarn deploy:production
```
