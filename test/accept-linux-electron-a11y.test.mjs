// The pure pieces of #228's acceptance driver (scripts/accept/linux-electron-a11y.mjs): how it reads the bus monitor,
// tells its own markers from an application's requests, and reads gdbus's replies. A count of zero between two
// markers is the evidence of a screenshot that asked nothing, so a misread here would pass that check silently.
import assert from 'node:assert/strict';
import test from 'node:test';
import {boolOf, foldMonitorLine, isMarker, offTheBusSentence, registryNames, requestsBetween, uintOf} from '../scripts/accept/linux-electron-a11y.mjs';

const call = (sender, destination, path, iface, member) =>
  `method call time=1764358000.123456 sender=${sender} -> destination=${destination} serial=7 path=${path}; interface=${iface}; member=${member}`;
const MARK = call(':1.40', 'org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root', 'org.a11y.atspi.Accessible', 'GetAttributes');

function fold(lines) {
  const messages = [];
  for (const line of lines) foldMonitorLine(messages, line);
  return messages;
}

test('a monitor line becomes a message with its fields, and its string arguments join it', () => {
  const [get] = fold([call(':1.9', ':1.5', '/org/a11y/atspi/accessible/root', 'org.freedesktop.DBus.Properties', 'Get'),
    '   string "org.a11y.atspi.Application"', '   string "ToolkitName"', 'method return time=1.0 sender=:1.5 -> destination=:1.9 serial=8 reply_serial=7']);
  assert.deepEqual(get, {type: 'method call', sender: ':1.9', destination: ':1.5', path: '/org/a11y/atspi/accessible/root',
    interface: 'org.freedesktop.DBus.Properties', member: 'Get', args: ['org.a11y.atspi.Application', 'ToolkitName']});
});

test('only a GetAttributes to the registry\'s own object is a marker; the same call to an application is a request', () => {
  const [mark, ask] = fold([MARK, call(':1.9', ':1.5', '/org/a11y/atspi/accessible/root', 'org.a11y.atspi.Accessible', 'GetAttributes')]);
  assert.equal(isMarker(mark), true);
  assert.equal(isMarker(ask), false);
});

test('between two markers: every GetAttributes and GetRelationSet that is not a marker, and nothing else', () => {
  const messages = fold([MARK,
    call(':1.9', ':1.5', '/org/a11y/atspi/accessible/root', 'org.freedesktop.DBus.Properties', 'Get'),
    call(':1.9', ':1.5', '/org/a11y/atspi/accessible/root', 'org.a11y.atspi.Accessible', 'GetAttributes'),
    'method return time=1.0 sender=:1.5 -> destination=:1.9 serial=9 reply_serial=8',
    call(':1.9', ':1.5', '/org/a11y/atspi/accessible/2', 'org.a11y.atspi.Accessible', 'GetRelationSet'),
    MARK,
    call(':1.9', ':1.5', '/org/a11y/atspi/accessible/root', 'org.a11y.atspi.Accessible', 'GetAttributes')]);
  const marks = messages.flatMap((m, i) => (isMarker(m) ? [i] : []));
  assert.deepEqual(marks, [0, 5]);
  assert.deepEqual(requestsBetween(messages, marks[0], marks[1]), [
    {sender: ':1.9', destination: ':1.5', path: '/org/a11y/atspi/accessible/root', member: 'GetAttributes'},
    {sender: ':1.9', destination: ':1.5', path: '/org/a11y/atspi/accessible/2', member: 'GetRelationSet'}]);
  assert.deepEqual(requestsBetween(messages, 0, 0), [], 'nothing between a marker and itself');
});

test('gdbus replies: the registry\'s children, a process id and a switch', () => {
  assert.deepEqual(registryNames("([(':1.5', objectpath '/org/a11y/atspi/accessible/root'), (':1.12', '/org/a11y/atspi/accessible/root')],)"), [':1.5', ':1.12']);
  assert.deepEqual(registryNames("([(':1.5', '/org/a11y/atspi/accessible/root')],)"), [':1.5']);
  assert.deepEqual(registryNames('([],)'), []);
  assert.deepEqual(registryNames('(@a(so) [],)'), [], 'an empty listing, as gdbus types it');
  // A reply it cannot read whole is no listing, never an empty one: "not on the bus" must not pass on a misread.
  for (const reply of ['', 'Error: GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown', "([(':1.5', objectpath '/a'), (':1.6', 7)],)"])
    assert.equal(registryNames(reply), null, reply);
  assert.equal(uintOf('(uint32 4242,)'), 4242);
  assert.equal(uintOf(''), null);
  assert.deepEqual([boolOf('(<true>,)'), boolOf('(<false>,)'), boolOf('')], [true, false, null]);
});

test('the off-the-bus sentence names the app, as the ticket words it', () => {
  assert.equal(offTheBusSentence('cua-electron-fixture'),
    'No accessibility tree: cua-electron-fixture, an Electron app by its window\'s role, is not on the accessibility bus, which it joins only as it starts; start it again with launch_app to get its elements.');
});
