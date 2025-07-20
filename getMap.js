const debug = require("debug")("StaticMaps-gl.getMap");
const genericPool = require("generic-pool");
const maplibre = require("@maplibre/maplibre-gl-native");
const fetch = require("node-fetch");
const fs = require("fs");

maplibre.on("message", function(e) {
  debug("maplibre: ", e);
  if (e.severity == "WARNING" || e.severity == "ERROR") {
    console.log("maplibre:", e);
  }
});

function getMap() {
  debug("Creating map");
  var _map = new maplibre.Map({
    ratio: 1.0,
    request: function(req, callback) {
      debug("request: " + JSON.stringify(req));
      var start = Date.now();
      var protocol = req.url.split(":")[0];
      if (protocol == "file") {
        var path = req.url.split("://")[1];
        fs.readFile(path, function(err, data) {
          if (err) {
            return callback(err);
          }
          var response = {};
          response.data = data;
          callback(null, response);
          debug("Request for " + req.url + " complete in " + (Date.now() - start) + "ms");
        });
      } else if (protocol === "http" || protocol === "https") {
        // Add proper headers for tile requests
        const headers = {
          'User-Agent': 'StaticMaps-gl/1.0',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate'
        };
        
        fetch(req.url, {
          headers: headers,
          timeout: 10000
        })
        .then(res => {
          const duration = Date.now() - start;
          if (duration > 500) {
            debug(
              "Request for " +
                req.url +
                " complete in " +
                duration +
                "ms.  Status:" +
                res.status
            );
          } else {
            debug("Request for " + req.url + " complete in " + duration + "ms");
          }
          
          if (res.ok) {
            return res.buffer().then(body => {
              var response = {};
              if (res.headers.get('last-modified')) {
                response.modified = new Date(res.headers.get('last-modified'));
              }
              if (res.headers.get('expires')) {
                response.expires = new Date(res.headers.get('expires'));
              }
              if (res.headers.get('etag')) {
                response.etag = res.headers.get('etag');
              }
              response.data = body;
              callback(null, response);
            });
          } else {
            debug("Request failed with status " + res.status + " for " + req.url);
            return callback(null, {});
          }
        })
        .catch(err => {
          debug("Request error for " + req.url + ": " + err.message);
          callback(err);
        });
      } else {
        debug(`request for invalid url: "${req.url}"`);
        return callback(`request for invalid url: "${req.url}"`);
      }
    }
  });
  return _map;
}

exports.getMap = getMap;
exports.getMapPool = function() {
  const factory = {
    create: function() {
      return new Promise(function(resolve, reject) {
        try {
          var map = getMap();
          resolve(map);
        } catch (err) {
          console.error("Error creating map:", err);
          reject(err);
        }
      });
    },
    destroy: function(resource) {
      return new Promise(function(resolve) {
        debug("Destroying map, used " + resource.useCount + " times.");
        resource.release();
        resolve();
      });
    }
  };

  const maxMapUses = 0;
  if (maxMapUses > 0) {
    factory["validate"] = function(resource) {
      debug("validate");
      return new Promise(function(resolve) {
        console.log("validate: usecount:" + resource.useCount);
        if (resource.useCount != undefined && resource.useCount > maxMapUses) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    };
  }

  const opts = {
    max: 20, // maximum size of the pool
    min: 0, // minimum size of the pool
    testOnBorrow: maxMapUses > 0,
    idleTimeoutMillis: 15 * 60 * 1000,
    evictionRunIntervalMillis: maxMapUses > 0 ? 5 * 60 * 1000 : 0
  };

  debug("Creating map pool with opts:", opts);
  const mapPool = genericPool.createPool(factory, opts);
  return mapPool;
};
