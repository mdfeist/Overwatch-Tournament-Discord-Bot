const AsciiTable = require('ascii-table');

//Add Fake Users for Testing
function randn_sr() {
  var u = 0, v = 0;
  while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0) return randn_sr(); // resample between 0 and 1
  return Math.round(5000.0*num);
}

function getRole(roles, role_id) {
  return (roles >>> role_id) & 1;
}

function bitCount(n) {
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

function permutations(xs) {
  let ret = [];

  for (let i = 0; i < xs.length; i = i + 1) {
    let rest = permutations(xs.slice(0, i).concat(xs.slice(i + 1)));

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

function valid_permutations(player_pool, xs) {
  function _valid_permutations(player_pool, xs, role = 0) {
    let ret = [];

    for (let i = 0; i < xs.length; i = i + 1) {
      let player = player_pool[xs[i]];
      if (getRole(player.role, role % 6) == 0) {
        continue;
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

  let valid = _valid_permutations(player_pool, xs);
  return valid.filter(comp => comp.length == player_pool.length);
}
/*
let p = comp[i];
if (p < combined_player_pool.length) {
  let r = i;
  if (r >= 6) {
    r -= 6;
  }
  if (getRole(combined_player_pool[p].role, r) == 0) {
    return false;
  }
}
*/

class Team {
  constructor(id) {
    this.id = id;
    this.players = [];
  }

  getID() {
    return id;
  }

  getName() {
    return `Team: ${this.id}`;
  }

  addPlayer(user) {
    this.players.push(user);
  }

  getPlayer(discord_id) {
    return this.players.find(player => player.discord_id == discord_id);
  }

  getPlayers() {
    return [...this.players];
  }

  isPlayerOnTeam(discord_id) {
    return this.getPlayer(discord_id) != null;
  }

  removePlayer(discord_id) {
    let player = this.getPlayer(discord_id);
    if (player) {
      let index = this.players.indexOf(player);
      this.players.splice(index, 1);
    }
  }

  getPlayerCount() {
    return this.players.length;
  }

  // Number of players that can play
  // this role
  getRoleCount(role) {
    let count = 0;
    for (var player of this.players) {
      if (player.role & (1 << role)) {
        count++;
      }
    }

    return count;
  }

  getRoles() {
    let roles = 0;
    for (var player of this.players) {
      roles |= player.role;
    }

    return roles;
  }

  getMissingRoles() {
    return ~this.getRoles() & 0x3F;
  }

  validTeamComps(number_of_players = 6) {
    // Get all permutations of team
    let valid = permutations([...Array(number_of_players).keys()]);

    // Can person even play the role given to them
    valid = valid.filter(comp => {
      for (let i = 0; i < 6; i++) {
        let p = comp[i];
        if (p < this.players.length) {
          if (getRole(this.players[p].role, i) == 0) {
            return false;
          }
        }
      }
      return true;
    });

    return valid;
  }


  getMinSR() {
    let min_sr = 5000;
    for (var player of this.players) {
      if (min_sr > player.sr) {
        min_sr = player.sr;
      }
    }

    return min_sr;
  }

  getMaxSR() {
    let max_sr = 0;
    for (var player of this.players) {
      if (max_sr < player.sr) {
        max_sr = player.sr;
      }
    }

    return max_sr;
  }

  getAverageSR() {
    let sr = 0;
    for (var player of this.players) {
      sr += player.sr;
    }

    return Math.round(sr / this.players.length);
  }

  table() {
    // Sort by rows
    var table = new AsciiTable(`Team ${this.id}`)
    table.setHeading('', '0', '1', '2', '3', '4', '5');
    let row = 0;
    for (var player of this.players) {
      let r = player.role;
      table.addRow(row, getRole(r, 0), getRole(r, 1), getRole(r, 2), getRole(r, 3), getRole(r, 4), getRole(r, 5));
      row++;
    }

    return table;
  }
}

function createTeamsFromPool(player_pool) {
  let teams = [];
  let current_team_id = 1;
  let current_team = new Team(current_team_id);

  player_pool = [...player_pool];

  while (player_pool.length > 0) {
    console.log(`Creating new team with remaining ${player_pool.length} players`);

    // All roles is 63
    let missing_roles = 63;

    // Fill missing roles
    while (missing_roles) {
      // Get the missing roles
      missing_roles = current_team.getMissingRoles();

      // Find player to fill role
      let possible_players = player_pool.filter(player => player.role & missing_roles);

      // If no player can fill the role then stop
      if (possible_players.length == 0) {
        break;
      }

      // Sort so players with the least amount of flex are picked first
      possible_players.sort(function(a, b) {return bitCount(a.role) - bitCount(b.role)});

      // Get player
      let player = possible_players[0];

      // Add player to team
      current_team.addPlayer(player);

      // Remove player from player pool
      let index = player_pool.indexOf(player);
      player_pool.splice(index, 1);
    }

    // If all roles are filled but the team doesn't
    // have 6 players then find roles that a single player
    // currently on the team fills mutiple of
    while (current_team.getPlayerCount() < 6) {
      // Get valid comps the team can play
      let valid_comps = current_team.validTeamComps();
      let player_number = current_team.getPlayerCount();

      let valid_roles = 0;
      for (let comp of valid_comps) {
        let role = comp.indexOf(player_number);
        valid_roles |= 1 << role;
      }

      // Find possible players to fill missing roles
      let possible_players = player_pool.filter(player => player.role & valid_roles);

      // If no player can fill the role then stop
      if (possible_players.length == 0) {
        break;
      }

      // Sort so players with the least amount of flex are picked first
      possible_players.sort(function(a, b) {return bitCount(a.role) - bitCount(b.role)});

      // Get player
      let player = possible_players[0];

      // Add player to team
      current_team.addPlayer(player);

      // Remove player from player pool
      let index = player_pool.indexOf(player);
      player_pool.splice(index, 1);
    }

    if (current_team.getPlayerCount() < 6) {
      break;
    }

    teams.push(current_team);

    current_team_id++;
    current_team = new Team(current_team_id);
  }

  return teams;
}

function balanceTeams(teams, subs) {
  // TODO: Balanace Teams
  teams.sort(function(a,b) {return a.getAverageSR() - b.getAverageSR()});
  let lowest_sr_team = teams[0];
  let highest_sr_team = teams[teams.length-1];

  // TODO: Get lowest sr player from lowest sr team
  // TODO: Get role of lowest sr player
  // TODO: Get player with equivalent role in higher sr teams
  // TODO: If lowest sr player lower than player in higher team swap
  // TODO: If not then move on to next sr player
}

function getSubPool(teams, player_pool) {
  let subs = [];
  for (var i = 0; i < player_pool.length; i++) {
    console.log(i);
    var found = false;
    let player = player_pool[i];
    for (var team of teams) {
      if (team.isPlayerOnTeam(player.discord_id)) {
        console.log(`found ${player.discord_id} on team ${team.id}`);
        found = true;
        break;
      }
    }

    if (!found) {
      subs.push(player);
    }
  }

  return subs;
}

function printPool(player_pool) {
  var table = new AsciiTable(`Players`)
  table.setHeading('', '0', '1', '2', '3', '4', '5');
  let row = 0;
  for (var player of player_pool) {
    let r = player.role;
    table.addRow(row, getRole(r, 0), getRole(r, 1), getRole(r, 2), getRole(r, 3), getRole(r, 4), getRole(r, 5));
    row++;
  }

  return table;
}

const testing_player = 64;
let player_pool = [];

// Create Player Pool
for (var i = 0; i < testing_player; i++) {
  let bnet = `FakeTester#${i}`;
  let sr = randn_sr();
  let role = 0;

  let num_of_roles = Math.floor(Math.random() * 2) + 1;

  for (var r = 0; r < num_of_roles; r++) {
    role |= (1 << Math.floor(Math.random() * 6));
  }

  let user = {
    bnet: bnet,
    discord_id: 'discord_' + bnet,
    sr: sr,
    role: role
  };

  player_pool.push(user);
}

let teams = createTeamsFromPool(player_pool);
let subs = getSubPool(teams, player_pool);

console.log(player_pool.length);
console.log(subs.length);

teams.sort(function(a,b) {return a.getAverageSR() - b.getAverageSR()});

for (var team of teams) {
  console.log(`${team.getName()}: (${team.getMinSR()}, ${team.getMaxSR()}) -  ${team.getAverageSR()}`);
}

console.log("--------------------------------");

balanceTeams(teams, subs);

for (var team of teams) {
  console.log(`${team.getName()}: (${team.getMinSR()}, ${team.getMaxSR()}) -  ${team.getAverageSR()}`);
}

let sub_team = new Team(teams.length+1);
for (var sub of subs) {
  sub_team.addPlayer(sub);
}
