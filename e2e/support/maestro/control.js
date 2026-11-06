// Maestro script: calls the test-control API (NFR-MNT-005; apps/api/README.md "Test control").
// Maestro runs scripts on the host, so the default address is localhost, not the emulator's 10.0.2.2.
// Env: ACTION (reset | otp | totp | clock), LOGIN_ID, ADVANCE_MS, CONTROL_URL, CONTROL_SECRET.
// Results go to `output`: output.otp, output.totp.
/* global http, json, output, ACTION, LOGIN_ID, ADVANCE_MS, CONTROL_URL, CONTROL_SECRET */
var base = (typeof CONTROL_URL !== 'undefined' && CONTROL_URL ? CONTROL_URL : 'http://localhost:3000') + '/__test/';
var secret = typeof CONTROL_SECRET !== 'undefined' && CONTROL_SECRET ? CONTROL_SECRET : 'local-e2e-control-secret';
var headers = { 'x-test-control-secret': secret, 'Content-Type': 'application/json' };

function call(method, path, body) {
  var response = method === 'GET'
    ? http.get(base + path, { headers: headers })
    : http.post(base + path, { headers: headers, body: JSON.stringify(body || {}) });
  if (!response.ok) throw new Error('test control ' + path + ' failed: ' + response.status);
  return json(response.body);
}

if (ACTION === 'reset') call('POST', 'reset');
else if (ACTION === 'otp') output.otp = call('GET', 'otp/' + LOGIN_ID).otp;
else if (ACTION === 'totp') output.totp = call('GET', 'totp/' + LOGIN_ID).code;
else if (ACTION === 'clock') call('POST', 'clock', { advanceMs: Number(ADVANCE_MS) });
else throw new Error('Unknown ACTION ' + ACTION);
