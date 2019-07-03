module.exports = Error;
module.exports.ERROR_CODES = {
  INVALID_INPUT: 1 << 0,
  DATABASE_ERROR: 1 << 1,
  FILE_NOT_FOUND: 1 << 2,
  CHANNEL_NOT_FOUND: 1 << 3
};

function Error(code, message)
{
  this.code = code;
  this.message = message;
}
