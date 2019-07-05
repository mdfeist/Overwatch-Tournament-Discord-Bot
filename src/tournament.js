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

function bitCount(n) {
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

class Team {
  constructor(id) {
    this.id = id;
    this.players = new Map();
  }

  getID() {
    return id;
  }

  getName() {
    return `Team: ${this.id}`;
  }

  addPlayer(user) {
    this.players.set(user.discord_id, user);
  }

  getPlayer(discord_id) {
    return this.players.get(discord_id);
  }

  isPlayerOnTeam(discord_id) {
    return this.players.has(discord_id);
  }

  removePlayer(discord_id) {
    this.players.delete(discord_id);
  }

  getPlayerCount() {
    return this.players.size;
  }

  getMissingRoles() {
    let roles = 0;
    for (var player of this.players) {
      roles |= player.role;
    }

    return ~roles;
  }

  getMissingRolesWithFlex() {
    let roles = 0;
    for (var player of this.players) {
      roles |= player.role;
    }

    return ~roles;
  }

  getAverageSR() {
    let sr = 0;
    for (var player of this.players) {
      sr += player.sr;
    }

    return sr / this.players.size;
  }

  toString() {
    let team_string = this.getName() + `:\n`
    for (var player of this.players) {
      team_string += player.bnet + ' ' + player.role;
    }
  }
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

  this.createTeams = async function() {
    // During testing make sure you
    // have at least this many players
    const testing_player = 60;

    var sql = `SELECT * FROM Users WHERE discord_id = (SELECT discord_id FROM Users_Tournaments WHERE tournament_id = '${this.id}')`;
    let users = await DB.database().allAsync(sql);

    function isValid(user) {
      return user['bnet'] != null && user['sr'] > 0 && user['sr'] < 5000 && user['role'] > 0;
    }

    let valid_users = users.filter(isValid);
    let invalid_users = users.filter(!isValid);

    //TODO: Message invalid users

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

    for (var i = valid_users.length; i < testing_player; i++) {
      let bnet = `FakeTester#${i}`;
      let sr = randn_sr();
      let role = 0;

      let num_of_roles = Math.floor(Math.random() * 3) + 1;

      for (var i = 0; i < num_of_roles; i++) {
        role |= (1 << Math.floor(Math.random() * 6));
      }

      let user = {
        bnet: bnet,
        discord_id: null,
        sr: sr,
        role: role
      };

      valid_users.push(user);
    }

    //TODO: Create teams
    let player_pool = [...valid_users];
    let current_team_id = 1;
    let current_team = new Team(current_team_id);

    while (player_pool.length > 0) {
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
        possible_players.sort(function(a, b) {return bitCount(a) - bitCount(b)});

        // Get player
        let player = possible_players[0];

        // Add player to team
        current_team.addPlayer(player);

        // Remove player from player pool
        let index = player_pool.indexOf(player);
        player_pool.splice(index, 1);
      }

      // TODO: If all roles are filled but the team doesn't
      // have 6 players then find roles that a single player
      // currently on the team fills mutiple of
      while (current_team.getPlayerCount() < 6) {

      }
    }

    //TODO: Create balanced teams based of role and sr
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
