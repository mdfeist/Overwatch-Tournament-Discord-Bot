const fs = require('fs');
const fetch = require("node-fetch");
const sqlite3 = require('sqlite3');
const Discord = require('discord.js');
const dateFormat = require('dateformat');

const config = require("./config.json");

// Create Discord Client
const client = new Discord.Client();

// open the database
const db = new sqlite3.Database('db/tournament.sqlite3', (err) => {
  if (err) {
    console.error(err.message);
  }
});

const ERROR_CODES = {
  INVALID_INPUT: 1 << 0,
  DATABASE_ERROR: 1 << 1,
  FILE_NOT_FOUND: 1 << 2,
  CHANNEL_NOT_FOUND: 1 << 3
};

const PREFIX = config.prefix;
const GUILD_ID = config.guild_id;

// Channels
// Category Channels
const OW_TOURNAMENT_CATEGORY_CHANNEL = 'Overwatch Tournaments';
const OW_TOURNAMENT_TEAMS_CATEGORY_CHANNEL = 'Overwatch Tournament Teams';

// Text Channels
const ANNOUNCEMENTS_CHANNEL = 'announcements';
const FORM_SUBMISSION_CHANNEL = 'form-submission';
const ROLE_SELECTION_CHANNEL = 'role-selection';
const BNET_SUBMISSION_CHANNEL = 'bnet-submission';
const WAITING_ROOM_CHANNEL = 'waiting-room';

var announcements_channel = null;
var form_submission_channel = null;
var role_selection_channel = null;
var bnet_submission_channel = null;
var waiting_room_channel = null;

// Special messages
var role_selection_message = null;

// Roles
const OW_TOURNAMENT_BOT_ROLE = 'OW Tournament';
const OW_TOURNAMENT_MANAGER_ROLE = 'OW Tournament Manager';

// Dynamic Roles and Channels
const OW_TOURNAMENT_TEAM_ROLE_PREFIX = 'OW Tournament Team ';
const OW_TOURNAMENT_TEAM_CHANNEL_PREFIX = 'ow-tournament-team-';

const PLAYER_ROLE_MESSAGE =
  `Please react to all the roles you play. You can select more than one role. \n\n
  \:zero: Main Tank \n
  \:one: Off Tank \n
  \:two: Hitscan DPS \n
  \:three: Projectile DPS \n
  \:four: Main Support \n
  \:five: Off Support \n\n
  `;

const helpInstructions = `\`\`\` \
${PREFIX} help \n \
${PREFIX} me \
\`\`\``;


const mangerHelpInstructions = `\`\`\` \
${PREFIX} tournament list \n \
${PREFIX} tournament delete TOURNAMENT_ID \n \
${PREFIX} tournament post TOURNAMENT_ID \n \
${PREFIX} tournament form \n \
${PREFIX} tournament clean \n \
${PREFIX} tournament new \
\`\`\``;

const commandHandlerForCommandName = {};
commandHandlerForCommandName['help'] = (msg, args) => {
  let instructions = `All users can run the following commands: \n` + helpInstructions;

  if (msg.member.roles.find(r => r.name === OW_TOURNAMENT_MANAGER_ROLE)) {
    instructions += `As a manager you can also run the following: \n` + mangerHelpInstructions;
  }

  msg.channel.send(instructions);
};

commandHandlerForCommandName['me'] = async (msg, args) => {
  const error_msg = `**Warning:** There was an error accessing the database. Maybe contact a manager or try again at a later time.`;

  let user = await getUser(msg.author.id);

  console.log(user);

  if (!user) {
    msg.author.send(error_msg);
    return;
  }

  /*
  if (results.error != null) {
    msg.author.send(error_msg);
    return;
  }

  console.log(results.);

  let user = results.user;
  */

  let stats = 'Hello, here is the current information I have on you:\n\n';

  if (user.bnet) {
    stats += `Your current bnet is **${user.bnet}**\n\n`;
  }

  if (user.sr) {
    stats += `Your current skill rating (sr) on record is **${user.sr}**\n\n`;
  }

  stats += `You have the following roles selected. If no roles are displayed below then visit <#${role_selection_channel.id}> and react to the message.\n\n`;

  for (const reaction of role_selection_message.reactions.values()) {
    let users = await reaction.fetchUsers(1, {before: msg.author.id+1, after: msg.author.id-1});
    let user = users.values().next().value;


    if (user.id == msg.author.id) {
      switch(reaction.emoji.name) {
        case '0⃣':
          stats += `- Main Tank is selected\n`;
          break;

        case '1⃣':
          stats += `- Off Tank is selected\n`;
          break;

        case '2⃣':
          stats += `- Hitscan DPS is selected\n`;
          break;

        case '3⃣':
          stats += `- Projectile DPS is selected\n`;
          break;

        case '4⃣':
          stats += `- Main Support is selected\n`;
          break;

        case '5⃣':
          stats += `- Off Support is selected\n`;
          break;
      }
    }
  }

  stats += `\n`;

  stats += `You have ${user.wins} wins and ${user.losses} losses with a total of ${user.wins + user.losses}\n\n`;

  if (!user.bnet || !user.sr) {
    stats += `\n**Warning:** You are missing the following information:\n\n`;

    if (!user.bnet) {
      stats += `- We don't have your bnet on file.\n`;
    }

    if (!user.sr) {
      stats += `- We don't have your skill rating (sr) on file.\n`;
    }
  }

  msg.author.send(stats);
};

commandHandlerForCommandName['test'] = (msg, args) => {
  console.log(announcements_channel);
  console.log(form_submission_channel);
  console.log(role_selection_channel);
  console.log(bnet_submission_channel);
};

commandHandlerForCommandName['tournament'] = (msg, args) => {

  if (!msg.member.roles.find(r => r.name === OW_TOURNAMENT_MANAGER_ROLE)) {
    msg.channel.send(`**Warning:** You do not have permissions to perform this action.`);
    return;
  }

  const command = args[0];

  switch (command) {
    case "list":
      listTournaments(msg);
      break;

    case "form":
      getTournamentForm(msg);
      break;

    case "new":
      newTournament(msg);
      break;

    case "delete":
      deleteTournament(args[1]);
      break;

    case "clean":
      var guild = client.guilds.get(GUILD_ID);
      removeTeamChannels(guild);
      msg.channel.send(`Teams were removed.`);
      break;

    case "post":
      postTournament(args[1]);
      break;

    default:
      msg.channel.send(`**Warning:** Following command not found: \n\n \`${PREFIX} tournament ${command}\``);
  }
};

// Async sqlite3 functions
db.getAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.get(sql, function (err, row) {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
};

db.runAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.run(sql, function (err, row) {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
};

async function getUser(discord_id) {
  var sql_get_user = `SELECT * FROM Users WHERE discord_id="${discord_id}"`;
  let user = await db.getAsync(sql_get_user);

  if (!user) {
    var insertSql = `INSERT INTO Users(discord_id) VALUES(${discord_id})`;
    await db.runAsync(insertSql);
    user = await db.getAsync(sql_get_user);
  }

  return user;
}

function getTournamentForm(msg) {
  let form = new Discord.MessageAttachment('assets/tournament_form.json');
  msg.channel.send('Fill out the form and return it with the new command', form);
}

function tournamentJSONToString(json) {
  let string = `[` + json['region'] + `][` + json['platform'] + `] **` + json["name"] + `**\n\n` + `**Date:** ` + json["date"] + ` at ` + json["24_hour_time"] + ` EST\n\n` + `**Description:**` + json["description"] + `\n\n` + `**Rules:**` + json["rules"] + `\n\n`;

  return string;
}

function tournamentToString(obj) {
  let date = new Date(obj['date']);

  // Offset to EST
  date = new Date(date.getTime() - 4 * 3600000);

  let string = `[` + obj['region'] + `][` + obj['platform'] + `] **` + obj["name"] + `**\n\n` +
  `**Date:** ` + dateFormat(date, "GMT:dddd, mmmm dS, yyyy, h:MM TT") + ` EST \n\n` +
  `**Description:**` + obj["description"] + `\n\n` +
  `**Rules:**` + obj["rules"] + `\n\n`;

  return string;
}

async function getAttachment(msg) {
  if (msg.attachments) {
    const getData = async url => {
      try {
        const response = await fetch(url);
        const json = await response.json();
        return json;
      } catch (error) {
        console.log(error);
        return null;
      }
    };

    return await getData(msg.attachments.first().url);

  } else {
      msg.channel.send(`**Error:** You need to send an attachment.`);
  }

  return null;
}

async function newTournament(msg) {
  if (!msg.member.roles.find(r => r.name === OW_TOURNAMENT_MANAGER_ROLE)) {
    msg.channel.send(`**Warning:** You do not have permissions to submit a tournament form.`);
    return;
  }

  // Get attachment
  let json = await getAttachment(msg);

  if (!json) {
    console.log(`No json file.`);
    msg.channel.send(`**Error:** The tournament form needs to be a JSON file. If it is then you might have errors in the formatting.`);
    return;
  }

  // Turn to string
  let tournament_string = tournamentJSONToString(json);
  msg.channel.send(tournament_string);

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

  console.log({
    name: name,
    date: start_date,
    region: region,
    platform: platform,
    description: description,
    rules: rules
  })

  // Save to database
  db.run("INSERT INTO Tournaments(name, date, region, platform, description, rules) VALUES(?,?,?,?,?,?)", [name, start_date.toISOString(), region, platform, description, rules], function(err) {
    if (err) {
      console.log(err);
      //Oops something went wrong
      msg.channel.send(`**Error:** Unable to save the tournament in the database.`);
    }
  });
}

function listTournaments(msg) {
  db.all(`SELECT id, name FROM Tournaments ORDER BY name`, [], (err, rows) => {
    if (err) {
      console.log(err);
      msg.channel.send(`**Error:** Had trouble querying database.`);
    } else {
      msg.channel.send(`Tournaments: (name: id)`);
      rows.forEach((row) => {
        msg.channel.send(row.name + `: ` + row.id);
      });
    }
  });
}

function deleteTournament(id) {
  let error = 0;
  // Delete from Tournaments table
  db.run(`DELETE FROM Tournaments WHERE id=?`, id, function(err) {
    if (err) {
        error &= ERROR_CODES.DATABASE_ERROR;
    }
  });

  // Delete from Users_Tournaments table
  db.run(`DELETE FROM Users_Tournaments WHERE tournament=?`, id, function(err) {
    if (err) {
        error &= ERROR_CODES.DATABASE_ERROR;
    }
  });

  return error;
}

function postTournament(id) {
  console.log(`Post Tournament: ${id}`);

  db.get(`SELECT * FROM Tournaments WHERE id=?`, id, (err, row) => {
    if (err) {
      console.log(err);
      return ERROR_CODES.DATABASE_ERROR;
    } else {
      let tournament_string = tournamentToString(row);
      if (announcements_channel) {
        announcements_channel.send(tournament_string).then(
          message => {
            message.react('✅');
          });
      } else {
        return ERROR_CODES.CHANNEL_NOT_FOUND;
      }
    }
  });

  return 0;
}

async function postPlayerRoleSelection() {
  if (role_selection_channel) {
    var sql = `SELECT * FROM Guild WHERE guild_id="${GUILD_ID}"`;
    let guild = await db.getAsync(sql);

    if (!guild) {
      var insertSql = `INSERT INTO Guild(guild_id) VALUES(${GUILD_ID})`;
      await db.runAsync(insertSql);
      guild = await db.getAsync(sql);
    }

    if (!guild.role_message_id) {
      let message = await role_selection_channel.send(PLAYER_ROLE_MESSAGE);

      role_selection_message = message;

      let main_tank_message = await message.react('0⃣');
      let off_tank_message = await message.react('1⃣');
      let hitscan_message = await message.react('2⃣');
      let projectile_message = await message.react('3⃣');
      let main_support_message = await message.react('4⃣');
      let off_support_message =await message.react('5⃣');

      var updateSql = `UPDATE Guild SET role_message_id = ${message.id} WHERE guild_id = "${GUILD_ID}"`;

      await db.runAsync(updateSql);
    } else {
       role_selection_message = await role_selection_channel.fetchMessage(guild.role_message_id);
    }

  } else {
    return ERROR_CODES.CHANNEL_NOT_FOUND;
  }

  return 0;
}

function doesRoleExist(guild, name) {
  return guild.roles.find(role => role.name == name);
}

function doesChannelExist(guild, name) {
  return guild.channels.find(channel => channel.name == name);
}

function getRole(guild, name) {
  return guild.roles.find(role => role.name == name);
}

function getRolesWithPrefix(guild, prefix) {
  return guild.roles.filter(role => role.name.startsWith(prefix));
}

async function createRole(guild, name, options = {}) {
  // Create a new role
  if (!doesRoleExist(guild, name)) {
    console.log(`Creating Role: ${name}`);
    return await guild.createRole(options);
  } else {
    return getRole(guild, name);
  }
}

function doesChannelHandleUserInput(channel) {
  let channels = [form_submission_channel, bnet_submission_channel];
  return channels.find(c => c.name == channel.name) != null;
}

function channelHandleUserInput(msg) {
  switch (msg.channel.name) {
    case form_submission_channel.name:
      console.log(`New tournament form was submitted.`);
      newTournament(msg);
      break;

    case bnet_submission_channel.name:
      console.log(`New bnet was submitted.`);
      break
  }
}

function getChannel(guild, name) {
  return guild.channels.find(channel => channel.name == name);
}

async function createChannel(guild, name, options = {}) {
  // Create a new role
  if (!doesChannelExist(guild, name)) {
    console.log(`Creating channel: ${name}`);
    return await guild.createChannel(name, options);
  } else {
      return getChannel(guild, name);
  }
}

async function createTeamChannels(guild, number_of_teams) {
  const bot_role = guild.roles.find(r => r.name === OW_TOURNAMENT_BOT_ROLE);
  const manager_role = guild.roles.find(role => role.name == OW_TOURNAMENT_MANAGER_ROLE);

  for (var i = 0; i < number_of_teams; i++) {
    let team_role = OW_TOURNAMENT_TEAM_ROLE_PREFIX + (i+1);
    let team_channel = OW_TOURNAMENT_TEAM_CHANNEL_PREFIX + (i+1);

    // Create Team Role
    let role = await createRole(guild, team_role, {
      name: team_role,
      color: 'ORANGE',
      permissions: 0,
    });

      // Create Tournament Category
    let category = await createChannel(guild,     OW_TOURNAMENT_TEAMS_CATEGORY_CHANNEL, options = {
      type:'category',
      permissionOverwrites: [
        {
          id: guild.defaultRole.id,
          deny: 2146958847
        },
        {
          id: manager_role,
          allow: 326630743,
        },
        {
          id: bot_role,
          allow: 326630743,
        },
      ],
    });

    // Create Team Text Channel
    createChannel(guild, team_channel + `-text`, options = {
      type:'text',
      parent: category,
    }).then(channel => {
      channel.lockPermissions().then(() => {
        channel.overwritePermissions(guild.defaultRole, {
          VIEW_CHANNEL: false,
        });

        channel.overwritePermissions(role, {
          VIEW_CHANNEL: true,
          SEND_MESSAGES: true,
          ATTACH_FILES: true,
        });
      })
    });

    // Create Team Voice Channel
    createChannel(guild, team_channel + `-voice`, options = {
      type:'voice',
      parent: category,
    }).then(channel => {
      channel.lockPermissions().then(() => {
        channel.overwritePermissions(guild.defaultRole, {
          VIEW_CHANNEL: false,
        });

        channel.overwritePermissions(role, {
          VIEW_CHANNEL: true,
          CONNECT: true,
          SPEAK: true,
        });
      })
    });
  }
}

function removeTeamChannels(guild) {
  // Delete all roles
  let roles = getRolesWithPrefix(guild, OW_TOURNAMENT_TEAM_ROLE_PREFIX);
  roles.forEach((role, key, map) => role.delete());

  let category = getChannel(guild, OW_TOURNAMENT_TEAMS_CATEGORY_CHANNEL);
  // Delete all channels
  category.children.forEach((channel, key, map) => channel.delete());

  // Delete Category
  category.delete();
}

async function setup(guild) {
  const bot_role = guild.roles.find(r => r.name === OW_TOURNAMENT_BOT_ROLE);

  // Create Manager Role
  let role = await createRole(guild, OW_TOURNAMENT_MANAGER_ROLE, {
    name: OW_TOURNAMENT_MANAGER_ROLE,
    color: 'BLUE',
    permissions: 292744535,
  });

    // Create Tournament Category
  let category = await createChannel(guild, OW_TOURNAMENT_CATEGORY_CHANNEL, options = {
    type:'category',
    permissionOverwrites: [
      {
        id: guild.defaultRole.id,
        deny: 2146958847
      },
      {
        id: role.id,
        allow: 326630743,
      },
      {
        id: bot_role.id,
        allow: 326630743,
      },
    ],
  });

  // Create Announcements
  createChannel(guild, ANNOUNCEMENTS_CHANNEL, options = {
    type:'text',
    parent: category,
  }).then(channel => {
    announcements_channel = channel;
    channel.lockPermissions().then(() =>
      channel.overwritePermissions(guild.defaultRole, {
        VIEW_CHANNEL: true,
        READ_MESSAGE_HISTORY: true,
      })
    );
  });

  // Create Form Submission
  createChannel(guild, FORM_SUBMISSION_CHANNEL, options = {
    type:'text',
    parent: category,
  }).then(channel => {
    form_submission_channel = channel;
    channel.lockPermissions();
  });

  // Create Role Selection
  createChannel(guild, ROLE_SELECTION_CHANNEL, options = {
    type:'text',
    parent: category,
  }).then(channel => {
    role_selection_channel = channel;
    channel.lockPermissions().then(() =>
      channel.overwritePermissions(guild.defaultRole, {
        VIEW_CHANNEL: true,
        READ_MESSAGE_HISTORY: true,
      })
    );

    postPlayerRoleSelection();
  });

  // Create Bnet Submission
  createChannel(guild, BNET_SUBMISSION_CHANNEL, options = {
    type:'text',
    parent: category,
  }).then(channel => {
    bnet_submission_channel = channel;
    channel.lockPermissions().then(() =>
      channel.overwritePermissions(guild.defaultRole, {
        VIEW_CHANNEL: true,
        READ_MESSAGE_HISTORY: true,
        SEND_MESSAGES: true,
      })
    );
  });

  // Create Waiting Room
  createChannel(guild, WAITING_ROOM_CHANNEL, options = {
    type:'voice',
    parent: category,
  }).then(channel => {
    waiting_room_channel = channel;
    channel.lockPermissions().then(() =>
      channel.overwritePermissions(guild.defaultRole, {
        VIEW_CHANNEL: true,
        CONNECT: true,
      })
    );
  });
}

// When the bot is connected and ready, log to console.
client.on('ready', () => {
  // Get a Guild by ID
  var guild = client.guilds.get(GUILD_ID);

  setup(guild);
  //createTeamChannels(guild, 4);

  client.user.setStatus("online");
  console.log('Connected and ready.');
});

// Every time a message is sent anywhere the bot is present,
// this event will fire and we will check if the bot was mentioned.
// If it was, the bot will attempt to respond with "Present".
client.on('message', msg => {
  try {
    const content = msg.content;

    // Ignore any messages sent as direct messages.
    // The bot will only accept commands issued in
    // a guild.
    if (!msg.channel.guild) {
      return;
    }

    // Check if message was posted in a special channel
    if (doesChannelHandleUserInput(msg.channel)) {
      // Handle special channels
      // bnet dump, form submission
      channelHandleUserInput(msg);
      return;
    }

    // Ignore any message that doesn't start with the correct prefix.
    if (!content.startsWith(PREFIX)) {
      return;
    }

    // Extract the parts of the command and the command name
    const parts = content.split(' ').map(s => s.trim()).filter(s => s);
    const commandName = parts[1];

    // Get the appropriate handler for the command, if there is one.
    const commandHandler = commandHandlerForCommandName[commandName];
    if (!commandHandler) {
      return;
    }

    // Separate the command arguments from the command prefix and command name.
    const args = parts.slice(2);

    // console.log(msg);

    // Execute the command.
    commandHandler(msg, args);
    //msg.delete();

  } catch (err) {
      console.warn('Error handling command');
      console.warn(err);
  }
});

/*
client.on('messageReactionAdd', (reaction, user) => {
	console.log(`${user.username} reacted to ${reaction.message.id} with "${reaction.emoji.name}".`);
});
*/

client.on('error', err => {
   console.warn(err);
});

client.login(config.token);
