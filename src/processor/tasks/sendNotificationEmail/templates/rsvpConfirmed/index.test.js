import template from './'

describe('rsvp confirmed', () => {
  it('works', () => {
    const str = template({
      name: 'test',
      eventTitle: 'myEvent',
      eventUrl: 'eventUrl'
    })

    expect(str).toEqual(`Hi test,

You have successfully RSVP'd for the event: myEvent

When you arrive at the event please remember to find the event organizers and
make sure that they check you in on Kickback. Otherwise you will not get your
payout at the end!

You can see the event page here:

eventUrl

thanks,

The Kickback team
`)
  })
})
