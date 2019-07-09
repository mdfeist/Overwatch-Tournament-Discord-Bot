const AsciiTable = require(`ascii-table`);

const Team = require(`./team`);
const Lobby = require(`./lobby`);

const utils = require(`./utils`);
const team_creator = require(`./team_creator`);

function getPlayersCloserToAnotherLobbiesSR(lobbies) {
  let num_of_lobbies = lobbies.length;

  // Get members that have an SR closer to another lobbies average
  let lobbies_tmp_members = []
  for (let i = 0; i < num_of_lobbies; i = i + 1) {
    lobbies_tmp_members[i] = [];
    for (let j = 0; j < num_of_lobbies; j = j + 1) {
      lobbies_tmp_members[i][j] = [];
    }
  }

  for (let i = 0; i < num_of_lobbies; i = i + 1) {
    let lobby = lobbies[i];
    let current_lobby_sr_average = lobby.getAverageSR();

    for (let player of lobby.getPlayers()) {
      let best_diff = Math.abs(player.sr - current_lobby_sr_average);
      let new_lobby = -1;

      for (let j = 0; j < num_of_lobbies; j = j + 1) {
        if (i == j) {
          continue;
        }

        let sr_diff = Math.abs(player.sr - lobbies[j].getAverageSR());
        if (sr_diff < best_diff) {
          new_lobby = j;
          best_diff = sr_diff;
        }
      }

      if (new_lobby >= 0) {
        lobbies_tmp_members[i][new_lobby].push(player);
      }
    }
  }

  return lobbies_tmp_members;
}

function printLobbiesPlayersWithSRCloserToAnotherLobby(lobbies_players) {
  let num_of_lobbies = lobbies_players.length;

  let string = `----------------------\n`;
  for (let i = 0; i < num_of_lobbies; i = i + 1) {
    let lobby = lobbies[i];

    for (let j = 0; j < num_of_lobbies; j = j + 1) {
      if (i == j) {
        continue;
      }

      string += `Players in Lobby ${i} are closer to Lobby ${j}\n`;
      string += `----------------------\n`;
      string += `Players:\n`;

      for (let player of lobbies_players[i][j]) {
        let r = player.role;
        string += `${player.bnet} - '${utils.getRole(r, 0)}${utils.getRole(r, 1)}${utils.getRole(r, 2)}${utils.getRole(r, 3)}${utils.getRole(r, 4)}${utils.getRole(r, 5)} - ${player.sr}\n`;
      }
      string += `----------------------\n`;
    }
  }

  string += `----------------------\n`;

  console.log(string);
}

function moveLobbyMembersBasedOffSR(lobbies, subs) {
  let num_of_lobbies = lobbies.length;

  // Move players closer to another lobby if there
  // is a replacement
  lobbies.sort(function(a,b) {return a.getAverageSR() - b.getAverageSR()});
  let lobbies_move_members = getPlayersCloserToAnotherLobbiesSR(lobbies);
  //printLobbiesPlayersWithSRCloserToAnotherLobby(lobbies_move_members);

  for (let i = 0; i < num_of_lobbies; i = i + 1) {
    let lobby = lobbies[i];

    for (let j = 0; j < num_of_lobbies; j = j + 1) {
      if (i == j) {
        continue;
      }

      // Move Player from i to j
      // if player can be added
      // if there is a replacement player for i that has
      // an SR closer to lobby i's SR average
      let player_pool = lobbies_move_members[i][j];

      for (let player of player_pool) {
        let can_player_be_added_to_lobby_j = lobbies[j].canPlayerBeAdded(player);
        if (can_player_be_added_to_lobby_j) {
          // Remove player from current lobby i
          lobby.removePlayer(player);

          let found_sub = false;
          let best_sub = null;
          let best_sub_index = 0;
          let best_sub_sr = Math.abs(lobby.getAverageSR() - player.sr);

          // Find a sub
          for (let k = 0; k < subs.length; k = k + 1) {
            let sub = subs[k];

            // Check if the sub is closer to the lobby sr
            let sub_sr_diff = Math.abs(lobby.getAverageSR() - sub.sr);

            // If sub is closer to the lobby sr
            if (sub_sr_diff < best_sub_sr) {
              let can_sub_be_added = lobby.canPlayerBeAdded(sub);
              let enough_to_create_teams = lobby.canTwoTeamsBeMadeWithPlayer(sub);

              // Check if sub can be added
              if (can_sub_be_added && enough_to_create_teams) {
                found_sub = true;
                best_sub_sr = sub_sr_diff;
                best_sub = sub;
                best_sub_index = k;
              }
            }
          }

          // Sub found
          if (found_sub) {
            // Add Sub to lobby
            lobby.addPlayer(best_sub);
            // Add player to new lobby
            lobbies[j].addPlayer(player);
            // Remove sub from sub list
            subs.splice(best_sub_index, 1);
          } else {
            // Can not move player add back to current lobby
            lobby.addPlayer(player);
          }
        }
      }
    }
  }
}

class PUG {
  constructor(id) {
    this.id = id;

    this.lobbies = [];
    this.subs = [];
  }

  createLobbiesWithPlayers(player_pool) {
    let teams = team_creator.createTeamsFromPool(player_pool);
    this.subs = team_creator.getSubPool(teams, player_pool);
    team_creator.makeNumberOfTeamsEven(teams, this.subs);

    team_creator.unbalanceTeams(teams);

    // Create groups
    let num_of_lobbies = teams.length / 2;
    this.lobbies = [];

    for (let i = 0; i < num_of_lobbies; i = i + 1) {
      let lobby = new Lobby(i);
      lobby.addPlayers(teams.pop().getPlayers());
      lobby.addPlayers(teams.pop().getPlayers());
      this.lobbies.push(lobby);
    }

    // Move players to another lobby if their SR is closer
    // to the other lobbies SR average, but only if by doing
    // so doesn't break the current lobby and doesn't make
    // the new lobby have subs that will have to wait mutple
    // rounds
    for (let i = 0; i < 3; i = i + 1) {
      moveLobbyMembersBasedOffSR(this.lobbies, this.subs);
    }

    // Add subs to lobby closest to their SR
    let tmp_lobbies = [...this.lobbies];
    for (let i = this.subs.length - 1; i >= 0; i = i - 1) {
      let sub = this.subs[i];

      let sr = sub.sr;
      tmp_lobbies.sort(function(a,b) {return Math.abs(sr - a.getAverageSR()) - Math.abs(sr - b.getAverageSR())});

      for (let j = 0; j < num_of_lobbies; j = j + 1) {
        let can_sub_be_added = tmp_lobbies[j].canPlayerBeAdded(sub);

        if (can_sub_be_added) {
          tmp_lobbies[j].addPlayer(sub);
          this.subs.splice(i, 1);
          break;
        }
      }
    }

    // Re-Run code to check if players in lobby have an SR
    // closer to another lobby. If so see if we can move them.
    for (let i = 0; i < 4; i = i + 1) {
      moveLobbyMembersBasedOffSR(this.lobbies, this.subs);
    }
  }

  getLobbies() {
    return this.lobbies;
  }
}

module.exports = PUG;
