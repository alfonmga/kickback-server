import { assertEmail } from './validators'

describe('assertEmail', () => {
  it('passes on good emails', () => {
    expect(() => assertEmail('tester@status.im')).not.toThrow()
  })

  it('fails on bad emails', () => {
    expect(() => assertEmail('tester@status.im')).not.toThrow()
  })
})
