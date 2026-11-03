'use strict';
const modern = require('minimatch-engine');
function compatible(api) {
  const run = typeof api === 'function' ? api : api.minimatch;
  const match = Object.assign((input, pattern, options) => run(input, pattern, options), api);
  match.minimatch = match;
  match.defaults = options => compatible(api.defaults(options));
  return match;
}
module.exports = compatible(modern);
