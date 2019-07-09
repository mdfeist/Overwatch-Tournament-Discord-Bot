// Get Fake Users SR for Testing
exports.randn_sr = function() {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0) return randn_sr(); // resample between 0 and 1
  return Math.round(5000.0*num);
}

exports.getRole = function(roles, role_id) {
  return (roles >>> role_id) & 1;
}

exports.bitCount = function(n) {
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

exports.permutations = function(xs) {
  let ret = [];

  for (let i = 0; i < xs.length; i = i + 1) {
    let rest = exports.permutations(xs.slice(0, i).concat(xs.slice(i + 1)));

    if(!rest.length) {
      ret.push([xs[i]])
    } else {
      for(let j = 0; j < rest.length; j = j + 1) {
        ret.push([xs[i]].concat(rest[j]))
      }
    }
  }
  return ret;
}

function valid_permutations(player_pool) {
  function _valid_permutations(player_pool, xs, role = 0) {
    let ret = [];

    let max = Math.floor(player_pool.length / 6);

    for (let i = 0; i < xs.length; i = i + 1) {
      let player = player_pool[xs[i]];
      if (role < max) {
        if (getRole(player.role, role % 6) == 0) {
          continue;
        }
      }

      let rest = _valid_permutations(player_pool, xs.slice(0, i).concat(xs.slice(i + 1)), role + 1);

      if(!rest.length) {
        ret.push([xs[i]])
      } else {
        for(let j = 0; j < rest.length; j = j + 1) {
          ret.push([xs[i]].concat(rest[j]))
        }
      }
    }

    return ret;
  }

  let xs = [...Array(player_pool.length).keys()];
  let valid = _valid_permutations(player_pool, xs);
  return valid;
}
