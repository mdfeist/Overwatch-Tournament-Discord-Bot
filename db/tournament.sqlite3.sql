BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "Users" (
	"id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
	"bnet"	TEXT UNIQUE,
	"discord_id"	TEXT NOT NULL UNIQUE,
	"sr"	INTEGER,
	"peak_sr"	INTEGER,
	"wins"	INTEGER NOT NULL DEFAULT 0,
	"losses"	INTEGER NOT NULL DEFAULT 0,
	"role"	INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "Guild" (
	"id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
	"guild_id"	TEXT NOT NULL,
	"role_message_id"	TEXT,
	"player_info_message"	TEXT
);
CREATE TABLE IF NOT EXISTS "Tournaments" (
	"id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
	"name"	TEXT NOT NULL,
	"region"	TEXT NOT NULL DEFAULT 'na',
	"platform"	TEXT NOT NULL DEFAULT 'pc',
	"description"	TEXT,
	"rules"	TEXT,
	"date"	TEXT NOT NULL,
	"type"	INTEGER NOT NULL DEFAULT 1,
	"checkin_message_id"	TEXT
);
CREATE TABLE IF NOT EXISTS "Users_Tournaments" (
	"id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
	"tournament"	INTEGER NOT NULL,
	"user"	INTEGER NOT NULL,
	"team"	INTEGER NOT NULL DEFAULT 0,
	"checked_in"	INTEGER NOT NULL DEFAULT 0
);
COMMIT;
