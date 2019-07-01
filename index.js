const fs = require('fs');
const request = require("request");
const sqlite3 = require('sqlite3');
const Discord = require('discord.js');

const config = require("./config.json");

// Create Discord Client
const client = new Discord.Client();

// open the database
const db = new sqlite3.Database('db/tournament.sqlite3', (err) => {
  if (err) {
    console.error(err.message);
  }
});

// TODO: Client.fetchUser(id)
// TODO: let channel = bot.channels.find("name", channel_name);

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
  ${PREFIX} help\n \
  ${PREFIX} tournament list \n \
  ${PREFIX} tournament delete TOURNAMENT_ID \n \
  ${PREFIX} tournament post TOURNAMENT_ID \n \
  ${PREFIX} tournament form\n \
  ${PREFIX} tournament clean \n \
  ${PREFIX} tournament new \
  \`\`\``;

function getTournamentForm(msg) {
  let form = new Discord.MessageAttachment('assets/tournament_form.json');
  msg.channel.send('Fill out the form and return it with the new command', form);
}

function tournamentJSONToString(json) {
  let string = `[` + json['region'] + `][` + json['device'] + `] **` + json["name"] + `**\n\n` + `**Date:** ` + json["date"] + ` at ` + json["24_hour_time"] + ` EST\n\n` + `**Description:**` + json["description"] + `\n\n` + `**Rules:**` + json["rules"] + `\n\n`;

  return string;
}

function newTournament(msg) {
  if (msg.attachments) {
    request(msg.attachments.first().url, function (err, response, body) {
      if (err) {
        msg.channel.send(`**Error:** Unable to read attachment.`);
      } else {
        try {
            let tournament_json = JSON.parse(body);
            let tournament_string = tournamentJSONToString(tournament_json);
            msg.channel.send(tournament_string);

            db.run("INSERT INTO Tournaments(name) VALUES(?)", [tournament_json["name"]], function(err) {
              if(null == err){
                  // row inserted successfully
                  fs.writeFile(`tournaments/${this.lastID}.json`, body, function(err) {
                    if(err) {
                      console.log(err);
                      msg.channel.send(`**Error:** Unable to save the tournament.`);
                      db.run(`DELETE FROM Tournaments WHERE id=?`, this.lastID, function(err) {
                        if (err) {
                            msg.channel.send(`**Error:** Problems connecting to database. There might be elements in the Tournaments database that are not linked to files.`);
                        }
                      });
                    } else {
                      msg.channel.send(`Tournament was successfully created.`);
                    }
                  });

              } else {
                console.log(err);
                //Oops something went wrong
                msg.channel.send(`**Error:** Unable to save the tournament.`);
              }
            });
        } catch (err) {
          console.log(err);
          msg.channel.send(`**Error:** The tournament form needs to be a JSON file. If it is then you might have errors in the formatting.`);
        }
      }

    });
  } else {
    msg.channel.send(`You need to attach the JSON form with this command. To get the form use the following command: \n\n \`${PREFIX} tournament form\``);
  }
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

function deleteTournament(id, callback = function(err) {}) {
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

  // delete json file
  fs.unlink(`tournaments/${id}.json`, function (err) {
      if (err) {
        error &= ERROR_CODES.FILE_NOT_FOUND;
      }
  });

  return error;
}

function postTournament(id) {
  fs.readFile(`tournaments/${id}.json`, 'utf-8', (err, data) => {
    if (err) {
      return ERROR_CODES.FILE_NOT_FOUND;
    }

    let tournament_json = JSON.parse(data);
    let tournament_string = tournamentJSONToString(tournament_json);

    if (announcements_channel) {
      announcements_channel.send(tournament_string).then(
        message => {
          message.react('✅');
        });
    } else {
      return ERROR_CODES.CHANNEL_NOT_FOUND;
    }
  });

  return 0;
}

function postPlayerRoleSelection(callback = function(msg) {}) {
  if (role_selection_channel) {
    role_selection_channel.send(PLAYER_ROLE_MESSAGE).then(
      message => {
        role_selection_message = message;

        callback(message);

        message.react('0⃣').
          then(() => message.react('1⃣')).
          then(() => message.react('2⃣')).
          then(() => message.react('3⃣')).
          then(() => message.react('4⃣')).
          then(() => message.react('5⃣'));
      });
  } else {
    return ERROR_CODES.CHANNEL_NOT_FOUND;
  }

  return 0;
}

const commandHandlerForCommandName = {};
commandHandlerForCommandName['help'] = (msg, args) => {
  msg.channel.send(helpInstructions);
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

function doesRoleExist(guild, name) {
  return guild.roles.filter(role => role.name == name).size > 0;
}

function doesChannelExist(guild, name) {
  return guild.channels.filter(channel => channel.name == name).size > 0;
}

function getRole(guild, name) {
  return guild.roles.filter(role => role.name == name);
}

function getRolesWithPrefix(guild, prefix) {
  return guild.roles.filter(role => role.name.startsWith(prefix));
}

function createRole(guild, name, options = {}, callback = function(role) {}) {
  // Create a new role
  if (!doesRoleExist(guild, name)) {
    console.log(`Creating Role: ${name}`);
    guild.createRole(options).then(role => callback(role))
      .catch(console.error);
  } else {
    let role = getRole(guild, name).values().next().value;
    callback(role);
  }
}

function getChannel(guild, name) {
  return guild.channels.filter(channel => channel.name == name);
}

function createChannel(guild, name, options = {}, callback = function(channel) {}) {
  // Create a new role
  if (!doesChannelExist(guild, name)) {
    console.log(`Creating channel: ${name}`);
    guild.createChannel(name, options).then(channel => callback(channel))
      .catch(console.error);
  } else {
      let channel = getChannel(guild, name).values().next().value;
      callback(channel);
  }
}

function createTeamChannels(guild, number_of_teams) {
  for (var i = 0; i < number_of_teams; i++) {
    let team_role = OW_TOURNAMENT_TEAM_ROLE_PREFIX + (i+1);
    let team_channel = OW_TOURNAMENT_TEAM_CHANNEL_PREFIX + (i+1);

    createRole(guild, team_role, {
      name: team_role,
      color: 'WHITE',
      permissions: 0,
    }, team_role => {
      // Create Tournament Category
      createChannel(guild, OW_TOURNAMENT_TEAMS_CATEGORY_CHANNEL, options = {
        type:'category',
      }, category => {
        // Create Team Text Channel
        createChannel(guild, team_channel + `-text`, options = {
          type:'text',
          parent: category,
          permissionOverwrites: [
          {
            id: guild.defaultRole.id,
            deny: ['VIEW_CHANNEL'],
          },
          {
            id: team_role,
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'],
          },
          {
            id: guild.roles.find(role => role.name == OW_TOURNAMENT_MANAGER_ROLE),
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'MANAGE_MESSAGES'],
          },
          {
            id: guild.roles.find(role => role.name == OW_TOURNAMENT_BOT_ROLE),
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'MANAGE_MESSAGES'],
          },
          ],
        });

        // Create Team Voice Channel
        createChannel(guild, team_channel + `-voice`, options = {
          type:'voice',
          parent: category,
          permissionOverwrites: [
          {
            id: guild.defaultRole.id,
            deny: ['VIEW_CHANNEL'],
          },
          {
            id: team_role,
            allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK'],
          },
          {
            id: guild.roles.find(role => role.name == OW_TOURNAMENT_MANAGER_ROLE),
            allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK', 'MUTE_MEMBERS'],
          },
          {
            id: guild.roles.find(role => role.name == OW_TOURNAMENT_BOT_ROLE),
            allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK', 'MUTE_MEMBERS'],
          },
          ],
        });
      });
    });
  }
}

function removeTeamChannels(guild) {
  // Delete all roles
  let roles = getRolesWithPrefix(guild, OW_TOURNAMENT_TEAM_ROLE_PREFIX);
  roles.forEach((role, key, map) => role.delete());

  let category = getChannel(guild, OW_TOURNAMENT_TEAMS_CATEGORY_CHANNEL).values().next().value;;
  // Delete all channels
  category.children.forEach((channel, key, map) => channel.delete());
}

function setup(guild) {
  const bot_role = guild.roles.find(r => r.name === OW_TOURNAMENT_BOT_ROLE);

  // Create Manager Role
  createRole(guild, OW_TOURNAMENT_MANAGER_ROLE, {
    name: OW_TOURNAMENT_MANAGER_ROLE,
    color: 'BLUE',
    permissions: 292744535,
  }, role => {
    // Create Tournament Category
    createChannel(guild, OW_TOURNAMENT_CATEGORY_CHANNEL, options = {
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
    }, category => {
      // Create Announcements
      createChannel(guild, ANNOUNCEMENTS_CHANNEL, options = {
        type:'text',
        parent: category,
      }, channel => {
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
      }, channel => {
        form_submission_channel = channel;
        channel.lockPermissions();
      });

      // Create Role Selection
      createChannel(guild, ROLE_SELECTION_CHANNEL, options = {
        type:'text',
        parent: category,
      }, channel => {
        role_selection_channel = channel;
        channel.lockPermissions().then(() =>
          channel.overwritePermissions(guild.defaultRole, {
            VIEW_CHANNEL: true,
            READ_MESSAGE_HISTORY: true,
          })
        );
        // TODO: Post Role Selection
        //postPlayerRoleSelection();
      });

      // Create Bnet Submission
      createChannel(guild, BNET_SUBMISSION_CHANNEL, options = {
        type:'text',
        parent: category,
      }, channel => {
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
      }, channel => {
        waiting_room_channel = channel;
        channel.lockPermissions().then(() =>
          channel.overwritePermissions(guild.defaultRole, {
            VIEW_CHANNEL: true,
            CONNECT: true,
          })
        );
      });
    });

    // Create Tournament Team Category
    createChannel(guild, OW_TOURNAMENT_TEAMS_CATEGORY_CHANNEL, options = {
      type:'category',
      permissionOverwrites: [
        {
          id: guild.defaultRole.id,
          deny: 2146958847
        },
        {
          id: role.id,
          allow: 292744535,
        },
        {
          id: bot_role.id,
          allow: 292744535,
        },
      ],
    });
  });
}

// When the bot is connected and ready, log to console.
client.on('ready', () => {
  // Get a Guild by ID
  var guild = client.guilds.get(GUILD_ID);

  setup(guild);

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
