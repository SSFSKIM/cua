// The console reader (src/remote/console.mjs) over the shape `ioreg -n Root -d1 -a` prints, and the XML property-list
// reader under it (src/remote/plist.mjs). The registry text is always injected: no test reads the real console.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkConsole, consoleStateOf} from '../src/remote/console.mjs';
import {parsePlist} from '../src/remote/plist.mjs';

const UID = 501;

// The shape of `ioreg -n Root -d1 -a` on macOS 26 (trimmed: the real root carries thousands of IOKitDiagnostics keys).
function registry({locked = false, users = [{uid: UID, onConsole: true}]} = {}) {
  const user = ({uid, onConsole, screenLocked}) => `
		<dict>
			<key>CGSSessionUniqueSessionUUID</key>
			<string>65E07E0D-C550-47BD-9C85-DA1F48C8DD0F</string>
			<key>kCGSSessionAuditIDKey</key>
			<integer>100024</integer>
			<key>kCGSSessionOnConsoleKey</key>
			<${onConsole}/>${screenLocked === undefined ? '' : `
			<key>CGSSessionScreenIsLocked</key>
			<${screenLocked}/>`}
			<key>kCGSSessionUserIDKey</key>
			<integer>${uid}</integer>
			<key>kCGSSessionUserNameKey</key>
			<string>someone &amp; co</string>
		</dict>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>IOConsoleLocked</key>
	<${locked}/>
	<key>IOConsoleUsers</key>
	<array>${users.map(user).join('')}
	</array>
	<key>IOKitBuildVersion</key>
	<string>Darwin Kernel Version 25.6.0</string>
	<key>IOKitDiagnostics</key>
	<dict>
		<key>Classes</key>
		<dict>
			<key>ACMKernelService</key>
			<integer>6</integer>
		</dict>
	</dict>
	<key>OSKernelCPUSubtype</key>
	<integer>18446744072635809794</integer>
</dict>
</plist>
`;
}

test('parsePlist reads dicts, arrays, strings, numbers, booleans, data and entities, and refuses what is not a plist', () => {
  const value = parsePlist(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- a comment > with a bracket -->
<plist version="1.0">
<dict>
  <key>Text</key><string>a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos; &#233;&#x41;</string>
  <key>Empty</key><string/>
  <key>List</key>
  <array>
    <integer>-3</integer>
    <real>2.5</real>
    <true/>
    <false/>
    <date>2026-10-06T00:00:00Z</date>
    <data>aGVs
      bG8=</data>
    <dict/>
    <array/>
  </array>
  <key>__proto__</key><string>kept as a key</string>
</dict>
</plist>`);
  assert.equal(value.Text, 'a <b> & "c" \'d\' éA');
  assert.equal(value.Empty, '');
  assert.deepEqual(value.List.slice(0, 5), [-3, 2.5, true, false, '2026-10-06T00:00:00Z']);
  assert.equal(value.List[5].toString('utf8'), 'hello');
  assert.deepEqual(value.List.slice(6), [{}, []]);
  assert.equal(Object.getPrototypeOf(value), Object.prototype, 'a __proto__ key does not replace the prototype');
  assert.equal(Object.getOwnPropertyDescriptor(value, '__proto__').value, 'kept as a key');

  for (const text of ['', 'not xml', '<plist version="1.0"><dict><key>a</key></dict></plist>', '<plist><string>x</plist>',
    '<plist><dict><string>no key</string><string>v</string></dict></plist>', '<plist><integer>1.5</integer></plist>',
    '<plist><string>a</string><string>b</string></plist>', '<plist><string>a</string></plist> trailing', '<plist><unknown/></plist>',
    '<plist><string>&bogus;</string></plist>'])
    assert.throws(() => parsePlist(text), {code: 'plist_invalid'}, JSON.stringify(text));
});

test('the console state: on the console and unlocked, locked by the console or by the session, off the console, or no session', () => {
  assert.deepEqual(consoleStateOf(registry(), UID), {onConsole: true, locked: false});
  assert.deepEqual(consoleStateOf(registry({locked: true}), UID), {onConsole: true, locked: true}, 'IOConsoleLocked');
  assert.deepEqual(consoleStateOf(registry({users: [{uid: UID, onConsole: true, screenLocked: true}]}), UID), {onConsole: true, locked: true}, 'CGSSessionScreenIsLocked');
  assert.deepEqual(consoleStateOf(registry({users: [{uid: UID, onConsole: true, screenLocked: false}]}), UID), {onConsole: true, locked: false});
  // Fast user switching: another user has the screen, this user's session is in the background.
  assert.deepEqual(consoleStateOf(registry({users: [{uid: 502, onConsole: true}, {uid: UID, onConsole: false}]}), UID), {onConsole: false, locked: false});
  // No GUI session of this user at all (nobody logged in: the kernel reports the console locked).
  assert.deepEqual(consoleStateOf(registry({locked: true, users: []}), UID), {onConsole: false, locked: true});
  assert.deepEqual(consoleStateOf(registry({users: [{uid: 502, onConsole: true}]}), UID), {onConsole: false, locked: false});
});

test('a registry that does not read as the root entry is console_unreadable, as is a failed read', async () => {
  for (const text of ['garbage', '<plist><array/></plist>', '<plist><dict><key>IOConsoleUsers</key><string>x</string></dict></plist>'])
    assert.throws(() => consoleStateOf(text, UID), {code: 'console_unreadable'}, text);
  await assert.rejects(checkConsole({read: async () => { throw Object.assign(new Error('spawn ENOENT'), {code: 'ENOENT'}); }, uid: UID}), {code: 'console_unreadable'});
  assert.deepEqual(await checkConsole({read: async () => registry({locked: true}), uid: UID}), {onConsole: true, locked: true});
});
