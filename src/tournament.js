const AsciiTable = require('ascii-table');

const dateFormat = require('dateformat');
const DB = require('./db');

module.exports = Tournament;
module.exports.TOURNAMENT_STATE = {
  NOT_STARTED: 0,
  POSTED: 1,
  CHECKIN_POSTED: 2,
  RUNNING: 3,
  FINISHED: 4
};

// Get Fake Users SR for Testing
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

  setPlayerAt(user, pos) {
    this.players[pos] = user;
  }


  getPlayerByID(discord_id) {
    return this.players.find(player => player.discord_id == discord_id);
  }

  getPlayerInPosition(pos) {
    return this.players[pos];
  }

  getPlayers() {
    return [...this.players];
  }

  isPlayerOnTeam(discord_id) {
    return this.getPlayerByID(discord_id) != null;
  }

  removePlayer(discord_id) {
    let player = this.getPlayerByID(discord_id);
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

  // Returns an array of the valid compositions the teams can play
  // Each row represents the roles.
  //
  // Column 0 - Main Tank
  // Column 1 - Off Tank
  // Column 2 - Histscan DPS
  // Column 3 - Porjectile DPS
  // Column 4 - Main Support
  // Column 5 - Off Support
  //
  // The value in the column is the player playing that role. The
  // value represents the players position in the players array.
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

  getTotalSR() {
    let sr = 0;
    for (var player of this.players) {
      sr += player.sr;
    }

    return sr;
  }

  getAverageSR() {
    return Math.round(this.getTotalSR() / this.players.length);
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

  toString() {
    let string = `${this.getName()}\n`;
    for (var player of this.players) {
      let r = player.role;
      string += `${player.bnet} - '${getRole(r, 0)}${getRole(r, 1)}${getRole(r, 2)}${getRole(r, 3)}${getRole(r, 4)}${getRole(r, 5)}\n`;
    }
    return string;
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

function randomSwapWithSubs(teams, subs) {
  let num_of_players = 6*teams.length + subs.length;
  let swap_probability = 1.0 / num_of_players;
  console.log(`Swap Probability: ${swap_probability}`);

  for (let i = 0; i < subs.length; i = i + 1) {
    // Get player on sub list
    let sub = subs[i];

    // Get all roles the player plays
    let roles = [];
    for (let role = 0; role < 6; role = role + 1) {
      if (getRole(sub.role, role)) {
        roles.push(role);
      }
    }

    // Get randome role
    let role = roles[Math.floor(Math.random()*roles.length)];

    // Get random team
    let team = teams[Math.floor(Math.random()*teams.length)];
    let valid_comp = team.validTeamComps();

    let team_player_pos = valid_comp[0][role];
    let team_player = team.getPlayerInPosition(team_player_pos);

    // Swap
    if (Math.random() > swap_probability) {
      team.setPlayerAt(sub, team_player_pos);
      subs[i] = team_player;
    }
  }
}

function balanceTeams(teams, subs) {
  // Balanace Teams by swapping players between teams
  for (var ti = 0; ti < 2*teams.length; ti = ti + 1) {
    teams.sort(function(a,b) {return a.getAverageSR() - b.getAverageSR()});
    let lowest_sr_team = teams[0];
    let highest_sr_team = teams[teams.length-1];

    let l_total_sr = lowest_sr_team.getTotalSR();
    let h_total_sr = highest_sr_team.getTotalSR();

    let l_team_comp = lowest_sr_team.validTeamComps();
    let h_team_comp = highest_sr_team.validTeamComps();

    // Get lowest sr player from lowest sr team and their role
    let l_player_pos = 0;
    let l_sr_player = 5000;
    let l_player_role = 0;
    for (var role = 0; role < l_team_comp[0].length; role = role + 1) {
      let player_pos = l_team_comp[0][role];
      let player = lowest_sr_team.getPlayerInPosition(player_pos);
      if (player.sr < l_sr_player) {
        l_sr_player = player.sr;
        l_player_pos = player_pos;
        l_player_role = role;
      }
    }

    let l_player_roles = [l_player_role];
    for (var comp = 1; comp < l_team_comp.length; comp = comp + 1) {
      for (var role = 0; role < l_team_comp[comp].length; role = role + 1) {
        let player_pos = l_team_comp[comp][role];
        if (player_pos == l_player_pos) {
          l_player_roles.push(role);
          break;
        }
      }
    }

    //If lowest sr player lower than player in higher team swap
    let current_sr_diff =  Math.abs(h_total_sr - l_total_sr);

    // Get lowest sr player
    let l_player = lowest_sr_team.getPlayerInPosition(l_player_pos);
    let best_h_player = null;
    let best_sr_diff = 5000;
    let best_swap_player_pos = 0;

    for (var role = 0; role < l_player_roles.length; role = role + 1) {
      for (var comp = 0; comp < h_team_comp.length; comp = comp + 1) {
        // Get player with equivalent role in higher sr teams
        let swap_player_pos = h_team_comp[comp][l_player_roles[role]];
        let h_player = highest_sr_team.getPlayerInPosition(swap_player_pos);

        let l_total_sr_if_swap = (l_total_sr - l_player.sr) + h_player.sr;
        let h_total_sr_if_swap = (h_total_sr - h_player.sr) + l_player.sr;

        let swap_sr_diff = Math.abs(h_total_sr_if_swap - l_total_sr_if_swap);

        if (swap_sr_diff < best_sr_diff) {
          best_sr_diff = swap_sr_diff;
          best_h_player = h_player;
          best_swap_player_pos = swap_player_pos;
        }
      }
    }

    // Swap if better than current
    if (best_sr_diff < current_sr_diff) {
      lowest_sr_team.setPlayerAt(best_h_player, l_player_pos);
      highest_sr_team.setPlayerAt(l_player, best_swap_player_pos);
    } else {
      // TODO: If not then move on to next sr player
      break;
    }
  }
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

module.exports.createTournament = async function(json) {
  console.log("Creating new tournament");

  // Get params
  let name = json["name"] || "Unnamed";
  let date = json["date"];
  let time = json["24_hour_time"];

  if (!date) {
    throw new Error(`**Error:** You need to include a start date.`);
  }

  if (!time) {
    throw new Error(`**Error:** You need to include a start time.`);
  }

  // Check date
  const date_regex = /^\d{1,2}\/\d{1,2}\/\d{4}$/ ;
  if (!date.match(date_regex))
  {
    throw new Error(`**Error:** Date is not in the correct format. It needs to be MM/DD/YYYY.`);
  }

  let [month, day, year] = date.split('/');

  const time_regex = /^\d{1,2}:\d{2}$/ ;
  if (!time.match(time_regex))
  {
    throw new Error(`**Error:** Time is not in the correct format. It needs to be hh:mm.`);
  }

  // Get EST Date
  let start_date = new Date(`${year}-${month}-${day}T${time}:00Z`);

  // Offset to GMT
  start_date = new Date(start_date.getTime() + 4 * 3600000);

  let region = json["region"] || "na";
  let platform = json["platform"] || "pc";

  let description = json["description"];
  let rules = json["rules"];

  let tournament = new Tournament({
    name: name,
    date: start_date,
    region: region,
    platform: platform,
    description: description,
    rules: rules,
    type: 1
  })

  await tournament.save();

  console.log(tournament);
  return tournament
}

module.exports.loadTournaments = async function() {
  console.log(`Loading Tournaments From Database.`);

  var sql = `SELECT * FROM Tournaments`;
  let tournaments = await DB.database().allAsync(sql);

  return await tournaments.map(db_tournament => {
    let tournament = new Tournament({
      id: db_tournament['id'],
      name: db_tournament['name'],
      date: new Date(db_tournament['date']),
      region: db_tournament['region'],
      platform: db_tournament['platform'],
      description: db_tournament['description'],
      rules: db_tournament['rules'],
      type: db_tournament['type'],
      state: db_tournament['state'],
      post_message_id: db_tournament['post_message_id'],
      checkin_message_id: db_tournament['checkin_message_id'],
    });

    return tournament;
  });
}

function Tournament(params)
{
  this.id = params.id;

  this.name = params.name;
  this.region = params.region;
  this.platform = params.platform;

  this.date = params.date;

  this.description = params.description;
  this.rules = params.rules;

  this.divisions = params.divisions;

  this.type = params.type;

  this.state = params.state;

  this.post_message_id = params.post_message_id;
  this.checkin_message_id = params.checkin_message_id;

  this.post_message = params.post_message;
  this.checkin_message = params.checkin_message;

  this.teams = [];
  this.subs = [];

  this.invalid_users = [];

  this.post = async function(channel) {
    if (!channel) {
      throw new Error(`**Error:** The channel is undefined.`);
    }

    if (this.post_message_id) {
      return;
    }

    let message = await channel.send(this.toString());

    this.post_message_id = message.id;
    this.post_message = message;

    var updateSql = `UPDATE Tournaments SET post_message_id = '${message.id}' WHERE id = '${this.id}'`;
    await DB.database().runAsync(updateSql);
  }

  this.postCheckin = async function(msg, channel) {
    if (!channel) {
      throw new Error(`**Error:** The channel is undefined.`);
    }

    if (this.checkin_message_id) {
      return;
    }

    let message = await channel.send(msg);
    message.react('✅');

    this.checkin_message_id = message.id;
    this.checkin_message = message;

    var updateSql = `UPDATE Tournaments SET checkin_message_id = '${message.id}' WHERE id = '${this.id}'`;
    await DB.database().runAsync(updateSql);
  }

  this.testCreateTeams = async function(testing_player) {
    let player_pool = [];

    // Create Player Pool
    for (var i = 0; i < testing_player; i++) {
      let bnet = `FakeTester#${i}`;
      let sr = randn_sr();
      let role = 0;

      let num_of_roles = Math.floor(Math.random() * 3) + 1;

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

    this.teams = createTeamsFromPool(player_pool);
    this.subs = getSubPool(this.teams, player_pool);
    randomSwapWithSubs(this.teams, this.subs);
    balanceTeams(this.teams, this.subs);

    for (var team of this.teams) {
      console.log(`${team.getName()}: (${team.getMinSR()}, ${team.getMaxSR()}) -  ${team.getAverageSR()}`);
    }

    for (var team of this.teams) {
      console.log(team.toString());
      console.log(team.validTeamComps());
    }

    console.log("--------------------------------");
    console.log("--------      SUBS      --------");
    console.log("--------------------------------");
    let sub_team = new Team(this.teams.length+1);
    for (var sub of this.subs) {
      sub_team.addPlayer(sub);
    }

    console.log(sub_team.toString());
  }

  this.createTeams = async function() {
    var sql = `SELECT * FROM Users WHERE discord_id = (SELECT discord_id FROM Users_Tournaments WHERE tournament_id = '${this.id}')`;
    let users = await DB.database().allAsync(sql);

    function isValid(user) {
      return user['bnet'] != null && user['sr'] > 0 && user['sr'] < 5000 && user['role'] > 0;
    }

    let valid_users = users.filter(isValid);
    this.invalid_users = users.filter(!isValid);

    //TODO: Message invalid users

    this.teams = createTeamsFromPool(valid_users);
    this.subs = getSubPool(this.teams, valid_users);
    randomSwapWithSubs(this.teams, this.subs);
    balanceTeams(this.teams, this.subs);
  }

  this.save = async function() {
    // Save to database
    if (this.id) {
      let sql = `UPDATE Tournaments SET name = '${name}', date = '${this.date.toISOString()}', region = '${this.region}', platform = '${this.platform}', description = '${this.description}', rules = '${this.rules}' WHERE id = '${this.id}'`;

      // TODO: Handle Error
      await DB.database().runAsync(sql);
    } else {
      let sql = `INSERT INTO Tournaments(name, date, region, platform, description, rules) VALUES('${this.name}', '${this.date.toISOString()}', '${this.region}', '${this.platform}', '${this.description}', '${this.rules}')`;

      // TODO: Handle Error
      this.id = await DB.database().runAsync(sql);
    }
  }

  this.toString = function() {
    // Offset to EST
    let date = null;
    if (this.date) {
      date = new Date(this.date.getTime() - 4 * 3600000);
    }

    let string = `[` + this.region + `][` + this.platform + `] **` + this.name + `**\n\n` +
    `**Date:** ` + dateFormat(date, "GMT:dddd, mmmm dS, yyyy, h:MM TT") + ` EST \n\n` +
    `**Description:** ` + this.description + `\n\n` +
    `**Rules:** ` + this.rules + `\n\n`;

    return string;
  }
}
