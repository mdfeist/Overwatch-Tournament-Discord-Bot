const AsciiTable = require('ascii-table');

const Team = require('./team');
const dateFormat = require('dateformat');
const DB = require('./db');

const utils = require('./utils');
const team_creator = require('./team_creator');

module.exports = Tournament;
module.exports.TOURNAMENT_STATE = {
  NOT_STARTED: 0,
  POSTED: 1,
  CHECKIN_POSTED: 2,
  RUNNING: 3,
  FINISHED: 4
};

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
      let sr = utils.randn_sr();
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

    this.teams = team_creator.createTeamsFromPool(player_pool);
    this.subs = team_creator.getSubPool(this.teams, player_pool);
    team_creator.randomSwapWithSubs(this.teams, this.subs);
    team_creator.balanceTeams(this.teams, this.subs);

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

    this.teams = team_creator.createTeamsFromPool(valid_users);
    this.subs = team_creator.getSubPool(this.teams, valid_users);
    team_creator.randomSwapWithSubs(this.teams, this.subs);
    team_creator.balanceTeams(this.teams, this.subs);
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
