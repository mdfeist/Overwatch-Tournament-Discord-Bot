const AsciiTable = require(`ascii-table`);

const Team = require(`./team`);

const utils = require(`./utils`);
const team_creator = require(`./team_creator`);

class Lobby {
  constructor(id) {
    this.id = id;

    this.team_blue = new Team(0);
    this.team_red = new Team(1);

    this.subs = [];

    this.players = [];
  }

  getBlueTeam() {
    return this.team_blue;
  }

  getRedTeam() {
    return this.team_red;
  }

  getSubs() {
    return this.subs;
  }

  getNumberOfSubs() {
    return this.subs.length;
  }

  addPlayer(player) {
    this.players.push(player);
  }

  addPlayers(players) {
    for (let player of players) {
      this.players.push(player);
    }
  }

  getPlayers() {
    return [...this.players];
  }

  removePlayer(player) {
    let index = this.players.indexOf(player);
    this.players.splice(index, 1);
  }

  getNumberOfPlayers() {
    return this.players.length;
  }

  getMinSR() {
    let min_sr = 5000;
    for (let player of this.players) {
      if (min_sr > player.sr) {
        min_sr = player.sr;
      }
    }

    return min_sr;
  }

  getMaxSR() {
    let max_sr = 0;
    for (let player of this.players) {
      if (max_sr < player.sr) {
        max_sr = player.sr;
      }
    }

    return max_sr;
  }

  getTotalSR() {
    let sr = 0;
    for (let player of this.players) {
      sr += player.sr;
    }

    return sr;
  }

  getAverageSR() {
    return Math.round(this.getTotalSR() / this.players.length);
  }

  validPlayerPool() {
    let number_of_teams = team_creator.createTeamsFromPool(this.players).length;
    return number_of_teams >= 2;
  }

  canTwoTeamsBeMadeWithPlayer(player) {
    let tmp_player_pool = [...this.players];
    tmp_player_pool.push(player);
    let number_of_teams = team_creator.createTeamsFromPool(tmp_player_pool).length;
    return number_of_teams >= 2;
  }

  canPlayerBeAdded(player) {
    let tmp_player_pool = [...this.players];
    tmp_player_pool.push(player);

    let number_of_teams_with_new_player = team_creator.createTeamsFromPool(tmp_player_pool, true).length;

    if (number_of_teams_with_new_player > 4) {
      return false;
    }

    return true;
  }

  toString() {
    let string = `----------------------\n`;
    string += `Lobby: ${this.id}\n`;
    string += `----------------------\n`;
    string += `Players:\n`;
    for (let player of this.players) {
      let r = player.role;
      string += `${player.bnet} - '${utils.getRole(r, 0)}${utils.getRole(r, 1)}${utils.getRole(r, 2)}${utils.getRole(r, 3)}${utils.getRole(r, 4)}${utils.getRole(r, 5)} - ${player.sr}\n`;
    }
    string += `----------------------\n`;
    string += `Stats:\n`;
    string += `----------------------\n`;
    string += `Size: ${this.players.length}\n`;
    string += `Average SR: ${this.getAverageSR()}\n`;
    string += `Minimum SR: ${this.getMinSR()}\n`;
    string += `Maximum SR: ${this.getMaxSR()}\n`;
    string += `----------------------\n`;

    return string;
  }
}

module.exports = Lobby;
