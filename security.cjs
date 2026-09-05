function isSonosURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'sonos.com' || u.hostname.endsWith('.sonos.com')); } catch { return false; }
}
module.exports = { isSonosURL };
