const AsciiTable = require('ascii-table');
const utils = require('./utils');
console.log(utils);

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
    let valid = utils.permutations([...Array(number_of_players).keys()]);

    // Can person even play the role given to them
    valid = valid.filter(comp => {
      for (let i = 0; i < 6; i++) {
        let p = comp[i];
        if (p < this.players.length) {
          if (utils.getRole(this.players[p].role, i) == 0) {
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
      table.addRow(row, utils.getRole(r, 0), utils.getRole(r, 1), utils.getRole(r, 2), utils.getRole(r, 3), utils.getRole(r, 4), utils.getRole(r, 5));
      row++;
    }

    return table;
  }

  toString() {
    let string = `${this.getName()}\n`;
    for (var player of this.players) {
      let r = player.role;
      string += `${player.bnet} - '${utils.getRole(r, 0)}${utils.getRole(r, 1)}${utils.getRole(r, 2)}${utils.getRole(r, 3)}${utils.getRole(r, 4)}${utils.getRole(r, 5)}\n`;
    }
    return string;
  }
}

module.exports = Team;
