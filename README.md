# KickBack backend server

* Ropsten deployment: https://dev.api.kickback.events [![Build Status](https://travis-ci.org/noblocknoparty/server.svg?branch=dev)](https://travis-ci.org/noblocknoparty/server)
* Mainnet deployment: https://live.api.kickback.events [![Build Status](https://travis-ci.org/noblocknoparty/server.svg?branch=master)](https://travis-ci.org/noblocknoparty/server)

This is a GraphAL API server.

Google Firestore is used as the backend storage, with separate storage databases for local, dev (Ropsten) and master (Mainnet).

More info on server is available [in the docs](https://github.com/noblocknoparty/docs/blob/master/BackendServer.md).

## Branches

* `dev` - Default branch, where latest development takes place
* `master` - Production branch

## Running

Please read [our full setup guide](https://github.com/noblocknoparty/docs/blob/master/RunningEverythingLocally.md)

**App mode**

The `.env` file gets auto-loaded at startup by the server and provides a
convenient way of setting environment variables.

The server has 3 running modes (can be set using the `APP_MODE` var in `.env` file):

  * `local` (default) - _server connects to local test network_
  * `development` - _server connects to Ropsten network on Infura_
  * `production` - _server connects to Mainnet on Infura_

**Firestore database**

Note that there are 3 Firestore databases:

* `kickback-local` - used for when running the dev server locally and testing (default)
* `kickback-dev` - used for the server running on the dev site against Ropsten
* `kickback-live` - used for the server running on the production site against Maininet

**GraphQL**

The GraphQL endpoint is at the `/graphql` URL path. If you load this path in a
browser you will get the [GraphQL playground](https://github.com/prisma/graphql-playground).


## Deployments

On CI we deploy to Zeit using [now](https://zeit.co/docs/getting-started/five-minute-guide-to-now).

To use the same commands locally you will need to set the following environment
variables (these also need to be set in [CI](https://travis-ci.org/noblocknoparty/server/settings)):

* `LOGDNA_API_KEY` - obtained from LogDNA
* `NOW_TOKEN` - obtained from https://zeit.co/account/tokens.
* `FIREBASE_TOKEN` - obtained using `yarn firebase login:ci`
* `CONFIG_ENCRYPTION_KEY` - obtained from our password vault
* `CONFIG_ENCRYPTION_IV` - obtained from our password vault

_Note: The last two encryption variables have also been setup in [Zeit](https://zeit.co/docs/getting-started/secrets), so if you change their
values remember to update Zeit. All Zeit secrets we use are visible in `.deploy/now.live.json`._

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

## Testing

Prior to running tests ensure you have a test network running:

```shell
npx ganache-cli --accounts 500
```

Now run:

```shell
yarn test
```

## License

AGPL v3
