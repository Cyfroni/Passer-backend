const KadDHT = require("libp2p-kad-dht");
const Libp2p = require("libp2p");
const TCP = require("libp2p-tcp");
const SPDY = require("libp2p-spdy");
const Multiplex = require("libp2p-mplex");
const SECIO = require("libp2p-secio");
const Bootstrap = require("libp2p-bootstrap");
const crypto = require("crypto");
const _ = require("underscore");
const toPull = require("stream-to-pull-stream");
const Readable = require("stream").Readable;
const glob = require("glob");
const fs = require("fs");
const pull = require("pull-stream");

const defaultsDeep = require("@nodeutils/defaults-deep");

const bootstrapers = [];

const chunkQuantity = 2;

const DEFAULT_OPTS = {
  modules: {
    transport: [TCP],
    connEncryption: [SECIO],
    streamMuxer: [Multiplex],
    peerDiscovery: [Bootstrap],
    dht: KadDHT
  },
  config: {
    dht: {
      // dht must be enabled
      enabled: true,
      kBucketSize: 20
    },
    peerDiscovery: {
      autoDial: true,
      bootstrap: {
        interval: 20e3,
        enabled: true,
        list: bootstrapers
      }
    }
  }
};

class Node extends Libp2p {
  constructor(opts, bootstrap_list) {
    const bootstrap_opts = DEFAULT_OPTS;
    bootstrap_opts.config.peerDiscovery.bootstrap.list = bootstrap_list;
    super(defaultsDeep(opts, bootstrap_opts));
  }

  addListeners() {
    this.on("error", err => {
      console.error("libp2p error: ", err);
      throw err;
    });

    this.on("peer:connect", peer => {
      console.log("Connection established to:", peer.id.toB58String());
    });

    this.handle("/file/1.0.0", (protocolName, connection) => {
      pull(
        connection,
        pull.collect((err, data) => {
          console.log("received:\n", data.toString());
          var num = data[0];
          var hash = data[1].toString();
          var shard = data[2].toString();
          var id = this.peerInfo.id.toB58String();
          fs.writeFile(`shards/${id}_${hash}_${num}`, shard, function(err) {
            if (err) throw err;
            console.log("File is created successfully.");
            // peer.contentRouting.provide(new Cid(1, "raw", data[1]), err => {
            //   if (err) throw err;

            //   console.log("Node %s is providing %s", id, hash);
            // });
          });
        })
      );
    });
  }

  async dhtPut(key, value) {
    const k = Buffer.from(key);
    const v = Buffer.from(value);
    try {
      await this.dht.put(k, v);
      console.log(`PUT: (${k},${v})`);
    } catch (e) {
      console.log(`PUT: (${k},${v}) -> ${e.message}`);
    }
  }
  async dhtGet(key) {
    const k = Buffer.from(key);
    try {
      const v = await this.dht.get(k);
      console.log(`GET: (${k},${v})`);
      return v;
    } catch (e) {
      console.log(`GET: (${k}) -> ${e.message}`);
    }
  }
  async addMetaData(hash) {
    var metaData = await this.dhtGet("0");
    metaData = metaData ? JSON.parse(metaData) : [];
    metaData.push(hash);
    this.dhtPut("0", JSON.stringify(metaData));
  }

  splitString(str, n) {
    var chunks = [];
    var quantity = Math.ceil(str.length / n);
    for (var i = 0, charsLength = str.length; i < charsLength; i += quantity) {
      chunks.push(str.substring(i, i + quantity));
    }
    return chunks;
  }

  async storeFile(fileName) {
    const data = fs.readFileSync(fileName, "utf8");
    console.log(`FILE: ${fileName}\n${data}`);

    const dataHash = crypto
      .createHash("md5")
      .update(data)
      .digest("hex");

    const chunks = this.splitString(data, chunkQuantity);
    var peers = this.peerBook.getAllArray();
    if (peers.length < chunkQuantity)
      throw new Error(
        `Not enough peers in the network (${peers.length} < ${chunkQuantity})`
      );
    _.sample(peers, chunkQuantity).forEach((p, i) => {
      var s = new Readable();
      s.push(i.toString());
      s.push(dataHash);
      s.push(chunks[i]);
      s.push(null);

      this.dialProtocol(p, "/file/1.0.0", (err, connection) => {
        pull(toPull.duplex(s), connection);
      });
    });
    this.addMetaData(dataHash);
  }

  getPeerChunks() {
    var id = this.peerInfo.id.toB58String();

    glob(`shards/${id}*`, function(er, files) {
      files.forEach(file => {
        console.log(file, "\n", fs.readFileSync(file).toString());
      });
    });
  }

  async processCommand(command) {
    var args = command.split(" ");
    var fun = args.shift();

    try {
      console.log(`RESULT: ${await this[fun](...args)}`);
    } catch (e) {
      console.log(e);
    }
  }
}

module.exports = { Node };
