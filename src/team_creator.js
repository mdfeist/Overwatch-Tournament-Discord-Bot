const Team = require('./team');
const utils = require('./utils');
console.log(utils);

exports.createTeamsFromPool = function(player_pool) {
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
      possible_players.sort(function(a, b) {return utils.bitCount(a.role) - utils.bitCount(b.role)});

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
      possible_players.sort(function(a, b) {return utils.bitCount(a.role) - utils.bitCount(b.role)});

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

exports.randomSwapWithSubs = function(teams, subs) {
  let num_of_players = 6*teams.length + subs.length;
  let swap_probability = 1.0 / num_of_players;
  console.log(`Swap Probability: ${swap_probability}`);

  for (let i = 0; i < subs.length; i = i + 1) {
    // Get player on sub list
    let sub = subs[i];

    // Get all roles the player plays
    let roles = [];
    for (let role = 0; role < 6; role = role + 1) {
      if (utils.getRole(sub.role, role)) {
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

exports.balanceTeams = function(teams, subs) {
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

exports.getSubPool = function(teams, player_pool) {
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

exports.printPool = function(player_pool) {
  var table = new AsciiTable(`Players`)
  table.setHeading('', '0', '1', '2', '3', '4', '5');
  let row = 0;
  for (var player of player_pool) {
    let r = player.role;
    table.addRow(row, utils.getRole(r, 0), utils.getRole(r, 1), utils.getRole(r, 2), utils.getRole(r, 3), utils.getRole(r, 4), utils.getRole(r, 5));
    row++;
  }

  return table;
}
