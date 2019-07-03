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

module.exports.createTournament = async function(json) {
  console.log("Creating new tournament");

  // Get params
  let name = json["name"] || "Unnamed";
  let date = json["date"];
  let time = json["24_hour_time"];

  if (!date) {
    msg.channel.send(`**Error:** You need to include a start date.`);
    return;
  }

  if (!time) {
    msg.channel.send(`**Error:** You need to include a start time.`);
    return;
  }

  // Check date
  const date_regex = /^\d{1,2}\/\d{1,2}\/\d{4}$/ ;
  if (!date.match(date_regex))
  {
    msg.channel.send(`**Error:** Date is not in the correct format. It needs to be MM/DD/YYYY.`);
    return;
  }

  let [month, day, year] = date.split('/');

  const time_regex = /^\d{1,2}:\d{2}$/ ;
  if (!time.match(time_regex))
  {
    msg.channel.send(`**Error:** Time is not in the correct format. It needs to be hh:mm.`);
    return;
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

  this.save = async function() {
    // Save to database
    if (this.id) {
      let sql = `UPDATE Tournaments SET name = '${name}', date = '${this.date.toISOString()}', region = '${this.region}', platform = '${this.platform}', description = '${this.description}', rules = '${this.rules}' WHERE id = '${this.id}'`;
      await DB.database().runAsync(sql);
    } else {
      let sql = `INSERT INTO Tournaments(name, date, region, platform, description, rules) VALUES('${this.name}', '${this.date.toISOString()}', '${this.region}', '${this.platform}', '${this.description}', '${this.rules}')`;
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
    `**Description:**` + this.description + `\n\n` +
    `**Rules:**` + this.rules + `\n\n`;

    return string;
  }
}
