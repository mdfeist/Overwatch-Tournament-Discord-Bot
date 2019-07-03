const sqlite3 = require('sqlite3');

var database = null;
exports.database = function() { return database; }

module.exports.setupDB = function(db_path) {
  database = new sqlite3.Database(db_path, (err) => {
    if (err) {
      console.error(err.message);
    }
  });

  // Async sqlite3 functions
  database.getAsync = function (sql) {
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

  database.allAsync = function (sql) {
      var that = this;
      return new Promise(function (resolve, reject) {
          that.all(sql, function (err, rows) {
              if (err)
                  reject(err);
              else
                  resolve(rows);
          });
      });
  };

  database.runAsync = function (sql) {
      var that = this;
      return new Promise(function (resolve, reject) {
          that.run(sql, function (err) {
              if (err)
                  reject(err);
              else
                  resolve(this.lastID);
          });
      });
  };
}
