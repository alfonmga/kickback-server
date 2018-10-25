export const promiseFnSequence = promiseFnArray => promiseFnArray.reduce((m, fn) => (
  m.then(() => fn())
), Promise.resolve())
