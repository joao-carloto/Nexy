// Best-effort detection of the LAN IP address students should type in to join
// a classroom-mode session. os.networkInterfaces() often returns several
// candidates on a real machine (VPN adapters, Hyper-V/VMware virtual
// switches, etc.) alongside the real Wi-Fi/Ethernet one, so this filters out
// the interface names known to be virtual/non-classroom-relevant rather than
// just returning the first IPv4 address found.
const os = require('os');

const IGNORED_NAME_PATTERNS = [
  /vmware/i,
  /virtualbox/i,
  /hyper-v/i,
  /virtual switch/i,
  /loopback/i,
  /docker/i,
  /wsl/i,
  /vpn/i,
  /tailscale/i,
];

function getLanAddress() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(nets)) {
    if (IGNORED_NAME_PATTERNS.some((pattern) => pattern.test(name))) continue;
    for (const addr of addresses || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        candidates.push({ name, address: addr.address });
      }
    }
  }

  // Prefer an interface named like Wi-Fi/Ethernet if more than one candidate
  // survives filtering -- still just a heuristic, so the caller (Settings)
  // should let the teacher confirm this is the right address, not blindly trust it.
  const preferred = candidates.find((c) => /wi-?fi|ethernet|en\d|wlan/i.test(c.name));
  return (preferred || candidates[0] || null)?.address || null;
}

module.exports = { getLanAddress };
