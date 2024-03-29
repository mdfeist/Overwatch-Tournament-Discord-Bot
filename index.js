const fs = require('fs');
const fetch = require("node-fetch");
const sqlite3 = require('sqlite3');
const Discord = require('discord.js');
const Long = require("long");
const dateFormat = require('dateformat');
const AsciiTable = require('ascii-table');

const Config = require("./config.json");
const Tournament = require('./src/tournament');
const DB = require('./src/db');

// Setup Database
DB.setupDB('db/tournament.sqlite3');

// Create Discord Client
const client = new Discord.Client();

const PREFIX = Config.prefix;
const GUILD_ID = Config.guild_id;

// Variables
var tournaments = new Map();

// Channels
// Category Channels
const OW_TOURNAMENT_CATEGORY_CHANNEL = 'Overwatch Tournaments';
const OW_TOURNAMENT_TEAMS_CATEGORY_CHANNEL = 'Overwatch Tournament Teams';

// Channel Names
const ANNOUNCEMENTS_CHANNEL = 'announcements';
const INSTRUCTIONS_CHANNEL = 'instructions';
const BOT_COMMANDS_CHANNEL = 'bot-commands';
const FORM_SUBMISSION_CHANNEL = 'form-submission';
const ROLE_SELECTION_CHANNEL = 'role-selection';
const BNET_SUBMISSION_CHANNEL = 'bnet-submission';
const SR_SUBMISSION_CHANNEL = 'sr-submission';
const WAITING_ROOM_CHANNEL = 'waiting-room';

// Special Channels
var announcements_channel = null;
var instructions_channel = null;
var bot_commands_channel = null;
var form_submission_channel = null;
var role_selection_channel = null;
var bnet_submission_channel = null;
var sr_submission_channel = null;
var waiting_room_channel = null;

// Special messages
var role_selection_message = null;
var player_information_message = null;

// Emojis
const PLAYER_INFO_EMOJI = 'ℹ';

const ROLE_MAIN_TANK_EMOJI = '0⃣';
const ROLE_OFF_TANK_EMOJI = '1⃣';
const ROLE_HITSCAN_EMOJI = '2⃣';
const ROLE_PROJECTILE_EMOJI = '3⃣';
const ROLE_MAIN_SUPPORT_EMOJI = '4⃣';
const ROLE_OFF_SUPPORT_EMOJI = '5⃣';

// Roles
const OW_TOURNAMENT_BOT_ROLE = 'OW Tournament';
const OW_TOURNAMENT_MANAGER_ROLE = 'OW Tournament Manager';

// Dynamic Roles and Channels
const OW_TOURNAMENT_TEAM_ROLE_PREFIX = 'OW Tournament Team ';
const OW_TOURNAMENT_TEAM_CHANNEL_PREFIX = 'ow-tournament-team-';

// Messages
const PLAYER_INFO_MESSAGE =
  `You can see the information the server has on you at any time by reacting to this message. The information stored is your battletag, skill rating (SR), roles, and win/loss.`;

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
  sendPlayerInformation(msg.author);
};

commandHandlerForCommandName['test'] = (msg, args) => {
  //console.log(announcements_channel);
  //console.log(form_submission_channel);
  //console.log(role_selection_channel);
  //console.log(bnet_submission_channel);
  console.log(waiting_room_channel);
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

    case "checkin":
      postTournamentCheckIn(args[1]);
      break;

    default:
      msg.channel.send(`**Warning:** Following command not found: \n\n \`${PREFIX} tournament ${command}\``);
  }
};

async function getUser(discord_id) {
  var sql_get_user = `SELECT * FROM Users WHERE discord_id="${discord_id}"`;
  let user = await DB.database().getAsync(sql_get_user);

  if (!user) {
    var insertSql = `INSERT INTO Users(discord_id) VALUES(${discord_id})`;
    await DB.database().runAsync(insertSql);
    user = await DB.database().getAsync(sql_get_user);
  }

  return user;
}

function getRoleIDFromEmoji(emoji) {
  switch(emoji) {
    case ROLE_MAIN_TANK_EMOJI:
      return 0;
      break;

    case ROLE_OFF_TANK_EMOJI:
      return 1;
      break;

    case ROLE_HITSCAN_EMOJI:
      return 2;
      break;

    case ROLE_PROJECTILE_EMOJI:
      return 3;
      break;

    case ROLE_MAIN_SUPPORT_EMOJI:
      return 4;
      break;

    case ROLE_OFF_SUPPORT_EMOJI:
      return 5;
      break;
  }
}

async function updateRole(user_id, role_id, clear) {
  let user = await getUser(user_id);

  let role = user['role'];

  if (clear) {
    role &= ~(1 << role_id);
  } else {
    role |= 1 << role_id;
  }

  // Update role
  let updateSql = `UPDATE Users SET role = '${role}' WHERE id = '${user.id}'`;
  await DB.database().runAsync(updateSql);
}

async function handleBnetSubmission(msg) {
  let bnet = msg.content.trim();

  const bnet_regex = /^[^0-9 ][\S]{3,12}#\d{4,5}$/ ;
  if (!bnet.match(bnet_regex)) {
    msg.reply(`Your battletag seems to be incorrect. Make sure you entered it correctly and did not include anything other than the battletag in the message.`);
    return;
  }

  // Called because the user will be created if
  // the user doesn't already exist in database
  let user = await getUser(msg.author.id);

  // Update battletag
  var updateSql = `UPDATE Users SET bnet = '${bnet}' WHERE discord_id = '${msg.author.id}'`;
  await DB.database().runAsync(updateSql);
}

async function handleSRSubmission(msg) {
  let sr = msg.content.trim();

  const sr_regex = /^[0-9]{1,4}$/ ;
  if (!sr.match(sr_regex)) {
    msg.reply(`Your skill rating (SR) seems to be incorrectly formatted. Make sure you entered it correctly and did not include anything other than your SR in the message.`);
    return;
  }

  // Called because the user will be created if
  // the user doesn't already exist in database
  let user = await getUser(msg.author.id);

  // Update SR
  var updateSql = `UPDATE Users SET sr = '${sr}' WHERE discord_id = '${msg.author.id}'`;
  await DB.database().runAsync(updateSql);
}

function getTournamentForm(msg) {
  let form = new Discord.MessageAttachment('assets/tournament_form.json');
  msg.channel.send('Fill out the form and return it with the new command', form);
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
  try {
    let tournament = await Tournament.createTournament(json);
    tournaments.set(tournament.id, tournament);
  } catch(error) {
    msg.channel.send(error.message);
  }
}

function listTournaments(msg) {
  var table = new AsciiTable('Tournaments')
  table.setHeading('id', 'name');
  for (var tournament of tournaments.values()) {
    table.addRow(tournament.id, tournament.name);
  }

  msg.channel.send('\`\`\`' + table.toString() + '\`\`\`');
}

async function loadTournaments() {
  let db_tournaments = await Tournament.loadTournaments();
  for (var tournament of db_tournaments) {
    tournaments.set(tournament.id, tournament);

    if (tournament.post_message_id) {
      tournament.post_message = await announcements_channel.fetchMessage(tournament.post_message_id);
    }

    if (tournament.checkin_message_id) {
      tournament.checkin_message = await announcements_channel.fetchMessage(tournament.checkin_message_id);
    }
  }
}

function deleteTournament(id) {
  // TODO: Move to tournament class
  /*
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
  */
  return 0;
}

async function postTournament(id) {
  console.log(`Post Tournament: ${id}`);

  let tournament = await tournaments.get(parseInt(id));

  if (!tournament) {
    throw new Error(`**Error:** There is no tournament with the id: ${id}.`)
  }

  tournament.post(announcements_channel);
}

async function postTournamentCheckIn(id) {
  console.log(`Post Tournament Checkin: ${id}`);

  let tournament = await tournaments.get(parseInt(id));

  if (!tournament) {
    throw new Error(`**Error:** There is no tournament with the id: ${id}.`)
  }

  // Offset to EST
  let date = new Date(tournament.date.getTime() - 4 * 3600000);

  let checkin_string = `**[${tournament.region}][${tournament.platform}] ${tournament.name}** is about to start.\n\nTo compete in the tournament please react. Also make sure all your information is correct. You can check in the <#${instructions_channel.id}>, there will be a message and button explaining in more details. You will only have a short time to do this as checkin will close at ` + dateFormat(date, "GMT:h:MM TT") + ` EST`;

  tournament.postCheckin(checkin_string, announcements_channel);
}

async function checkin(user_id, msg_id, checked = true) {
  console.log('Checking if checkin message');
  let tournament = null;
  for (var t of tournaments.values()) {
    if (t.checkin_message_id == msg_id) {
      tournament = t;
      break;
    }
  }

  if (tournament) {
    console.log('Tournament Found');
    var sql = `SELECT * FROM Users_Tournaments WHERE tournament_id='${tournament.id}' AND discord_id='${user_id}'`;

    // TODO: Handle Error
    let user = await DB.database().getAsync(sql);

    if (user) {
      let sql = `UPDATE Users_Tournaments SET checked_in = '${checked}' WHERE tournament_id='${tournament.id}' AND discord_id='${user_id}'`;
      // TODO: Handle Error
      await DB.database().runAsync(sql);
    } else {
      let sql = `INSERT INTO  Users_Tournaments(tournament_id, discord_id, checked_in) VALUES('${tournament.id}', '${user_id}', '${checked}')`;
      // TODO: Handle Error
      await DB.database().runAsync(sql);
    }

    // Was a tournament checkin message
    return true;
  }

  // Was not a tournament checkin message
  return false;
}

async function getChecked(tournament_id) {
  let tournament = null;
  for (var t of tournaments.values()) {
    if (t.checkin_message_id == msg_id) {
      tournament = t;
      break;
    }
  }

  if (tournament) {
    tournament.createTeams();
    // Was a tournament checkin message
    return true;
  }
  // Was not a tournament checkin message
  return false;
}

async function sendPlayerInformation(author) {
  const error_msg = `**Warning:** There was an error accessing the database. Maybe contact a manager or try again at a later time.`;

  let user = await getUser(author.id);

  console.log(user);

  if (!user) {
    author.send(error_msg);
    return;
  }

  let stats = 'Hello, here is the current information I have on you:\n\n';

  if (user.bnet) {
    stats += `Your current bnet is **${user.bnet}**\n\n`;
  }

  if (user.sr) {
    stats += `Your current skill rating (sr) on record is **${user.sr}**\n\n`;
  }

  stats += `You have the following roles selected. If no roles are displayed below then visit <#${role_selection_channel.id}> and react to the message. If you already did and no roles are shown remove the reaction first and then reclick the reaction.\n\n`;

  if (user.role & (1 << getRoleIDFromEmoji(ROLE_MAIN_TANK_EMOJI))) {
    stats += `- Main Tank is selected\n`;
  }

  if (user.role & (1 << getRoleIDFromEmoji(ROLE_OFF_TANK_EMOJI))) {
    stats += `- Off Tank is selected\n`;
  }

  if (user.role & (1 << getRoleIDFromEmoji(ROLE_HITSCAN_EMOJI))) {
    stats += `- Hitscan DPS is selected\n`;
  }

  if (user.role & (1 << getRoleIDFromEmoji(ROLE_PROJECTILE_EMOJI))) {
    stats += `- Projectile DPS is selected\n`;
  }

  if (user.role & (1 << getRoleIDFromEmoji(ROLE_MAIN_SUPPORT_EMOJI))) {
    stats += `- Main Support is selected\n`;
  }

  if (user.role & (1 << getRoleIDFromEmoji(ROLE_OFF_SUPPORT_EMOJI))) {
    stats += `- Off Support is selected\n`;
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

  author.send(stats);
}

async function postPlayerInfo() {
  if (instructions_channel) {
    var sql = `SELECT * FROM Guild WHERE guild_id="${GUILD_ID}"`;
    let guild = await DB.database().getAsync(sql);

    if (!guild) {
      var insertSql = `INSERT INTO Guild(guild_id) VALUES(${GUILD_ID})`;
      await DB.database().runAsync(insertSql);
      guild = await DB.database().getAsync(sql);
    }

    if (!guild.player_info_message) {
      let message = await instructions_channel.send(PLAYER_INFO_MESSAGE);

      player_info_message = message;

      await message.react(PLAYER_INFO_EMOJI);

      var updateSql = `UPDATE Guild SET player_info_message = ${message.id} WHERE guild_id = "${GUILD_ID}"`;

      await DB.database().runAsync(updateSql);
    } else {
       player_info_message = await instructions_channel.fetchMessage(guild.player_info_message);
    }

  } else {
    // TODO: Throw Error
  }

  return 0;
}

async function postPlayerRoleSelection() {
  if (role_selection_channel) {
    var sql = `SELECT * FROM Guild WHERE guild_id="${GUILD_ID}"`;
    let guild = await DB.database().getAsync(sql);

    if (!guild) {
      var insertSql = `INSERT INTO Guild(guild_id) VALUES(${GUILD_ID})`;
      await DB.database().runAsync(insertSql);
      guild = await DB.database().getAsync(sql);
    }

    if (!guild.role_message_id) {
      let message = await role_selection_channel.send(PLAYER_ROLE_MESSAGE);

      role_selection_message = message;

      let main_tank_message = await message.react(ROLE_MAIN_TANK_EMOJI);
      let off_tank_message = await message.react(ROLE_OFF_TANK_EMOJI);
      let hitscan_message = await message.react(ROLE_HITSCAN_EMOJI);
      let projectile_message = await message.react(ROLE_PROJECTILE_EMOJI);
      let main_support_message = await message.react(ROLE_MAIN_SUPPORT_EMOJI);
      let off_support_message = await message.react(ROLE_OFF_SUPPORT_EMOJI);

      var updateSql = `UPDATE Guild SET role_message_id = ${message.id} WHERE guild_id = "${GUILD_ID}"`;

      await DB.database().runAsync(updateSql);
    } else {
       role_selection_message = await role_selection_channel.fetchMessage(guild.role_message_id);
    }

  } else {
    // TODO: Throw Error
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
  let channels = [form_submission_channel, bnet_submission_channel, sr_submission_channel];
  return channels.find(c => c.name == channel.name) != null;
}

function channelHandleUserInput(msg) {
  if (msg.member.roles.find(r => r.name === OW_TOURNAMENT_BOT_ROLE)) {
    return;
  }

  switch (msg.channel.name) {
    case form_submission_channel.name:
      console.log(`New tournament form was submitted.`);
      newTournament(msg);
      break;

    case bnet_submission_channel.name:
      console.log(`New bnet was submitted.`);
      handleBnetSubmission(msg);
      break

    case sr_submission_channel.name:
      console.log(`New sr was submitted.`);
      handleSRSubmission(msg);
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

  // Create Instructions
  createChannel(guild, INSTRUCTIONS_CHANNEL, options = {
    type:'text',
    parent: category,
  }).then(channel => {
    instructions_channel = channel;
    channel.lockPermissions().then(() =>
      channel.overwritePermissions(guild.defaultRole, {
        VIEW_CHANNEL: true,
        READ_MESSAGE_HISTORY: true,
      })
    );

    postPlayerInfo();

  });

  // Create Bot Commands
  createChannel(guild, BOT_COMMANDS_CHANNEL, options = {
    type:'text',
    parent: category,
  }).then(channel => {
    bot_commands_channel = channel;
    channel.lockPermissions().then(() =>
      channel.overwritePermissions(guild.defaultRole, {
        VIEW_CHANNEL: true,
        READ_MESSAGE_HISTORY: true,
        SEND_MESSAGES: true,
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

  // Create sr Submission
  createChannel(guild, SR_SUBMISSION_CHANNEL, options = {
    type:'text',
    parent: category,
  }).then(channel => {
    sr_submission_channel = channel;
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
  loadTournaments();
  //createTeamChannels(guild, 4);

  /*
  var date = Date.now();
  date = new Date(date + 5000);
  setTimeout(function(){ console.log(date.toString()); }, date.getTime() - Date.now());
  */

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

client.on('messageReactionAdd', (reaction, user) => {
  console.log('messageReactionAdd');

  if (user.bot) {
    return;
  }

  console.log(role_selection_message.id);
	console.log(`${user.username} reacted to ${reaction.message.id} with "${reaction.emoji.name}".`);

  if (player_info_message.id == reaction.message.id) {
    console.log(`Get user inforamtion for ${user.username}`);
    sendPlayerInformation(user);
    reaction.remove(user);
    return;
  }

  if (role_selection_message.id == reaction.message.id) {
    console.log(`Update role for ${user.username}`);
    let role_id = getRoleIDFromEmoji(reaction.emoji.name);
    updateRole(user.id, role_id, false);
    return;
  }

  // Check if it was a tournament checkin message
  // If yes the function will check in the user
  if (checkin(user.id, reaction.message.id, true)) {
    return;
  }
});

client.on('messageReactionRemove', (reaction, user) => {
  if (user.bot) {
    return;
  }

  console.log(role_selection_message.id);
	console.log(`${user.username} removed reaction to ${reaction.message.id} with "${reaction.emoji.name}".`);

  if (role_selection_message.id == reaction.message.id) {
    console.log(`Update role for ${user.username}`);
    let role_id = getRoleIDFromEmoji(reaction.emoji.name);
    updateRole(user.id, role_id, true);
    return;
  }

  if (player_info_message.id == reaction.message.id) {
    return;
  }

  // Check if it was a tournament checkin message
  // If yes the function will remove the user from
  // the tournament
  if (checkin(user.id, reaction.message.id, false)) {
    return;
  }
});

client.on('error', err => {
   console.warn(err);
});

client.login(Config.token);
