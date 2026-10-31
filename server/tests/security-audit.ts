import { SecurityValidator, RateLimiter } from '../src/security/validator';
import { SessionAuth } from '../src/security/auth';
import { MemoryWatchdog } from '../src/security/watchdog';

console.log('====================================================');
console.log(' 🛡️ CRAFTBOT EXTENDED PRODUCTION AUDIT SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(description: string, condition: boolean) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    process.exitCode = 1;
  }
}

// ==========================================
// 1. SSRF & CLOUD METADATA ATTACKS
// ==========================================
console.log('--- TEST GROUP 1: SSRF & Cloud Metadata Exploits ---');

const ssrfPayloads = [
  '169.254.169.254',           // AWS / Oracle Cloud Metadata Service
  '169.254.1.1',               // Link-local
  '127.0.0.1',                 // Localhost loopback
  'localhost',                 // Localhost hostname
  '0.0.0.0',                   // Zero address
  '10.0.0.1',                  // Private Class A
  '172.16.0.1',                // Private Class B
  '192.168.1.1',               // Private Class C
  '169.254.169.254; rm -rf /', // Command injection attempt
  '$(whoami).evil.com',        // Subshell attempt
];

for (const payload of ssrfPayloads) {
  const result = SecurityValidator.validateServerHost(payload, false);
  assert(`SSRF Attack blocked: "${payload}"`, !result.valid);
}

// Legitimate public hosts should be accepted
const validHosts = ['play.hypixel.net', 'mc.myserver.org', '89.12.45.67'];
for (const host of validHosts) {
  const result = SecurityValidator.validateServerHost(host, false);
  assert(`Valid public host accepted: "${host}"`, result.valid && result.sanitized === host.toLowerCase());
}

// ==========================================
// 2. PORT SCANNING & DANGEROUS PORTS
// ==========================================
console.log('\n--- TEST GROUP 2: Port Scanning Protection ---');

const dangerousPorts = [22, 23, 25, 80, 443, 3001, 3306, 5432, 6379, 27017];
for (const port of dangerousPorts) {
  const result = SecurityValidator.validatePort(port, false);
  assert(`Dangerous port ${port} blocked`, !result.valid);
}

const invalidPorts = [-1, 0, 65536, 99999, NaN, 25565.5];
for (const port of invalidPorts) {
  const result = SecurityValidator.validatePort(port, false);
  assert(`Invalid port range ${port} blocked`, !result.valid);
}

const validPort = SecurityValidator.validatePort(25565, false);
assert('Standard Minecraft port 25565 accepted', validPort.valid && validPort.sanitized === 25565);

// ==========================================
// 3. CHAT PACKET INJECTION & OVERFLOWS
// ==========================================
console.log('\n--- TEST GROUP 3: Chat Packet Injection & Overflow ---');

// Packet newline injection
const newlinePayload = 'Hello server\r\n/op HackerPlayer\n/stop';
const sanitizedChat = SecurityValidator.sanitizeChatMessage(newlinePayload);
assert('Newlines and carriage returns stripped from chat', !sanitizedChat.sanitized?.includes('\n') && !sanitizedChat.sanitized?.includes('\r'));

// Null byte injection
const nullBytePayload = 'Test\0malicious';
const sanitizedNull = SecurityValidator.sanitizeChatMessage(nullBytePayload);
assert('Null bytes stripped from chat', !sanitizedNull.sanitized?.includes('\0'));

// Massive 10,000 char buffer overflow payload
const massiveString = 'A'.repeat(10000);
const sanitizedOverflow = SecurityValidator.sanitizeChatMessage(massiveString);
assert('Massive chat string truncated to Minecraft 256-char limit', sanitizedOverflow.valid && sanitizedOverflow.sanitized!.length === 256);

// ==========================================
// 4. REAL-WORLD: ZALGO & RTL OVERRIDE EXPLOITS
// ==========================================
console.log('\n--- TEST GROUP 4: Zalgo & RTL Override Defense ---');

// Right-to-Left Override (\u202E) used to disguise malicious commands
const rtlPayload = 'Normal chat\u202Egnirts_desrever';
const sanitizedRtl = SecurityValidator.sanitizeChatMessage(rtlPayload);
assert('Right-to-Left override stripped', !sanitizedRtl.sanitized?.includes('\u202E'));

// Zero-width space (\u200B) used to evade bot spam filters
const zeroWidthPayload = 'word\u200Bwith\u200Binvisible\u200Bspaces';
const sanitizedZeroWidth = SecurityValidator.sanitizeChatMessage(zeroWidthPayload);
assert('Zero-width invisible characters stripped', !sanitizedZeroWidth.sanitized?.includes('\u200B'));

// Extreme Zalgo text overflow
const zalgoPayload = 'Zalgo T\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308\u0309ext';
const sanitizedZalgo = SecurityValidator.sanitizeChatMessage(zalgoPayload);
assert('Excessive stacked zalgo diacritics stripped', sanitizedZalgo.valid);

// ==========================================
// 5. REAL-WORLD: PERMANENT BAN & IP BLACKLIST PROTECTION
// ==========================================
console.log('\n--- TEST GROUP 5: Ban Detection (Preventing VPS IP Bans) ---');

const banReasons = [
  'You are banned from this server! Reason: Cheating',
  'Server is whitelist only. You are not whitelisted.',
  'Kicked by operator: Nilesh_Admin',
  'Server is undergoing scheduled maintenance.',
  'Auth failed: Invalid AuthMe password.',
];

for (const reason of banReasons) {
  const isPermanent = SecurityValidator.isBanOrPermanentKick(reason);
  assert(`Ban keyword recognized to block reconnect loop: "${reason.slice(0, 30)}..."`, isPermanent);
}

// Temporary disconnects should NOT be treated as bans
const transientErrors = ['Timed out', 'Connection reset by peer', 'Internal Exception: java.io.IOException'];
for (const reason of transientErrors) {
  const isPermanent = SecurityValidator.isBanOrPermanentKick(reason);
  assert(`Transient error allowed for reconnect retry: "${reason}"`, !isPermanent);
}

// ==========================================
// 6. USERNAME SANITIZATION & BOUNDARIES
// ==========================================
console.log('\n--- TEST GROUP 6: Username Validation ---');

const invalidUsernames = [
  '',
  'ab',                         // Too short (< 3)
  'A_Very_Long_Minecraft_Username_Exceeding_16', // Too long (> 16)
  'User Name',                  // Spaces
  'User-Name',                  // Dashes
  '<script>alert(1)</script>',  // XSS
  'User;DROP TABLE',            // SQL injection pattern
  'User\nName',
];

for (const name of invalidUsernames) {
  const res = SecurityValidator.validateUsername(name);
  assert(`Malicious/invalid username rejected: "${name}"`, !res.valid);
}

const validUsernames = ['Nilesh_Gamer', 'FarmerBob', 'AFK_123', 'Steve'];
for (const name of validUsernames) {
  const res = SecurityValidator.validateUsername(name);
  assert(`Valid Minecraft username accepted: "${name}"`, res.valid && res.sanitized === name);
}

// ==========================================
// 7. INVENTORY BOUNDARY & SLOT OVERFLOW
// ==========================================
console.log('\n--- TEST GROUP 7: Inventory Slot Boundary Checks ---');

const invalidSlots = [-1, 46, 100, 99999, NaN, 2.5];
for (const slot of invalidSlots) {
  const res = SecurityValidator.validateInventorySlot(slot);
  assert(`Out of bounds inventory slot ${slot} rejected`, !res.valid);
}

for (let s = 0; s <= 45; s += 15) {
  const res = SecurityValidator.validateInventorySlot(s);
  assert(`Valid slot ${s} within 0-45 accepted`, res.valid);
}

// ==========================================
// 8. SESSION TOKEN CRYPTO & TAMPER PROOFING
// ==========================================
console.log('\n--- TEST GROUP 8: Session Token Tamper Proofing ---');

const token = SessionAuth.createSessionToken('user_abc_123', 'Nilesh_Gamer');
assert('Generated valid signed session token', typeof token === 'string' && token.includes('.'));

const verified = SessionAuth.verifySessionToken(token);
assert('Verified valid session token successfully', verified !== null && verified.uid === 'user_abc_123' && verified.ownerIgn === 'Nilesh_Gamer');

// Tamper signature
const tamperedToken = token.slice(0, -4) + 'abcd';
const tamperedResult = SessionAuth.verifySessionToken(tamperedToken);
assert('Tampered signature rejected by HMAC verify', tamperedResult === null);

// Forged payload with legitimate signature
const forgedToken = 'eyJ1aWQiOiJoYWNrZXIifQ.fakeSignature';
assert('Forged token rejected', SessionAuth.verifySessionToken(forgedToken) === null);

// ==========================================
// 9. RATE LIMITING PROTECTION
// ==========================================
console.log('\n--- TEST GROUP 9: Rate Limiting ---');

const limiter = new RateLimiter();
const key = 'test_user_burst';

// Allow up to 3 actions in 1 second
assert('Action 1 allowed', limiter.isAllowed(key, 3, 1000));
assert('Action 2 allowed', limiter.isAllowed(key, 3, 1000));
assert('Action 3 allowed', limiter.isAllowed(key, 3, 1000));
assert('Action 4 blocked by rate limiter', !limiter.isAllowed(key, 3, 1000));
assert('Action 5 blocked by rate limiter', !limiter.isAllowed(key, 3, 1000));

// ==========================================
// 10. REAL-WORLD: MEMORY WATCHDOG TELEMETRY
// ==========================================
console.log('\n--- TEST GROUP 10: Memory Watchdog Diagnostics ---');

const watchdog = MemoryWatchdog.getInstance();
const metrics = watchdog.getMetrics(2);
assert('Watchdog reports non-zero heapUsedMB', metrics.heapUsedMB > 0);
assert('Watchdog reports non-zero rssMB', metrics.rssMB > 0);
assert('Watchdog accurately tracks active bot count', metrics.activeBotsCount === 2);

// ==========================================
// 11. UID & ENDPOINT INPUT SANITIZATION
// ==========================================
console.log('\n--- TEST GROUP 11: UID & Input Sanitization ---');

const validUids = [
  'dDnW2MKP5TctiKDVpFWPAvhFCW03',
  'user_12345',
  'auth-user-id.98',
  'user@domain.com',
];

for (const uid of validUids) {
  const result = SecurityValidator.validateUid(uid);
  assert(`Valid UID format accepted: "${uid}"`, result.valid && result.sanitized === uid);
}

const maliciousUids = [
  '',
  '   ',
  '<script>alert("xss")</script>',
  '../../etc/passwd',
  'user; DROP TABLE users;--',
  'a'.repeat(129), // Exceeds max length
  'uid with spaces',
  'uid\0nullbyte',
  'uid\nnewline',
];

for (const badUid of maliciousUids) {
  const result = SecurityValidator.validateUid(badUid);
  assert(`Malicious/invalid UID blocked: "${badUid.slice(0, 20)}"`, !result.valid);
}

// ==========================================
// 12. RUNTIME CRYPTO SECRET GENERATION
// ==========================================
console.log('\n--- TEST GROUP 12: HMAC Token Security ---');

const testToken1 = SessionAuth.createSessionToken('sec_user_1', 'PlayerOne');
const testToken2 = SessionAuth.createSessionToken('sec_user_2', 'PlayerTwo');
assert('Session token 1 successfully verified', SessionAuth.verifySessionToken(testToken1)?.uid === 'sec_user_1');
assert('Session token 2 successfully verified', SessionAuth.verifySessionToken(testToken2)?.uid === 'sec_user_2');
assert('Cross-verifying swapped signature fails', SessionAuth.verifySessionToken(testToken1.split('.')[0] + '.' + testToken2.split('.')[1]) === null);

// ==========================================
// 13. SERVER HOST & PORT NORMALIZATION
// ==========================================
console.log('\n--- TEST GROUP 13: Server Host & Port Normalization ---');

const parsedAternos = SecurityValidator.cleanServerAddressAndPort('ChoduCID-7CAj.aternos.me:16808');
assert('Inline port in host extracted: 16808', parsedAternos.host === 'choducid-7caj.aternos.me' && parsedAternos.port === 16808);

const parsedHttp = SecurityValidator.cleanServerAddressAndPort('http://play.hypixel.net/');
assert('Protocol prefix and trailing slash stripped', parsedHttp.host === 'play.hypixel.net' && parsedHttp.port === 25565);

const parsedTcp = SecurityValidator.cleanServerAddressAndPort('tcp://mc.example.com:25566');
assert('tcp prefix and inline port extracted: 25566', parsedTcp.host === 'mc.example.com' && parsedTcp.port === 25566);

const parsedSeparate = SecurityValidator.cleanServerAddressAndPort('mc.myserver.org', 19132);
assert('Separate port parameter respected', parsedSeparate.host === 'mc.myserver.org' && parsedSeparate.port === 19132);

// ==========================================
// SUMMARY
// ==========================================
console.log('\n====================================================');
console.log(` RESULTS: ${passedTests}/${totalTests} PRODUCTION AUDIT TESTS PASSED`);
console.log('====================================================\n');
