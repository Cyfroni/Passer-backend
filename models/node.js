const KadDHT = require("libp2p-kad-dht");
const Libp2p = require("libp2p");
const TCP = require("libp2p-tcp");
const Multiplex = require("libp2p-mplex");
const SECIO = require("libp2p-secio");
const Bootstrap = require("libp2p-bootstrap");
const crypto = require("crypto");
const _ = require("underscore");
const globby = require("globby");
const fse = require("fs-extra");
const pull = require("pull-stream");
const CID = require("cids");
const multihashing = require("multihashing-async");

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

function splitString(str, n) {
  const chunks = [];
  const quantity = Math.ceil(str.length / n);
  for (let i = 0, charsLength = str.length; i < charsLength; i += quantity) {
    chunks.push(str.substring(i, i + quantity));
  }
  return chunks;
}

async function getCidFromHash(hash) {
  const mh = await multihashing(Buffer.from(hash), "sha2-256");
  return new CID(1, "dag-pb", mh);
}

class Node extends Libp2p {
  constructor(opts, bootstrap_list) {
    const bootstrap_opts = DEFAULT_OPTS;
    bootstrap_opts.config.peerDiscovery.bootstrap.list = bootstrap_list;
    super(defaultsDeep(opts, bootstrap_opts));
  }

  addListeners() {
    this._id = this.peerInfo.id.toB58String();
    const id = this._id;
    const cRouting = this.contentRouting;

    this.on("error", err => {
      console.error("libp2p error: ", err);
      throw err;
    });

    this.on("peer:connect", peer => {
      console.log("Connection established to:", peer.id.toB58String());
    });

    this.handle("/storeFile/1.0.0", (protocolName, connection) => {
      pull(
        connection,
        pull.collect(async (err, data) => {
          if (err) throw err;

          const hash = data[0].toString();
          const shard = data[1].toString();

          await fse.writeFile(`shards/${id}_${hash}`, shard);
          console.log("File is created successfully.");

          const cid = await getCidFromHash(hash);
          await cRouting.provide(cid);
          console.log("Node %s is providing %s", id, cid.toString());
        })
      );
    });
    this.handle("/retrieveFile/1.0.0", (protocolName, connection) => {
      pull(
        connection,
        pull.collect(async (err, data) => {
          if (err) throw err;
          const fileHash = data[0].toString();

          const chunk = await this.getChunkFromPeer(fileHash);
          console.log("Chunk:", chunk);
          pull(pull.values([chunk]), connection);
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
    let metaData = await this.dhtGet("0");
    metaData = metaData ? JSON.parse(metaData) : [];
    metaData.push(hash);
    this.dhtPut("0", JSON.stringify(metaData));
  }

  getPeersToStore() {
    const peers = this.peerBook.getAllArray();
    if (peers.length < chunkQuantity)
      throw new Error(
        `Not enough connected peers (${peers.length} < ${chunkQuantity})`
      );

    return _.sample(peers, chunkQuantity);
  }

  async storeFile(fileName) {
    const file = await fse.readFile(fileName, "utf8");
    console.log(`FILE: ${fileName}\n${file}`);

    const chunks = splitString(file, chunkQuantity);
    const peers = this.getPeersToStore();

    const dataHash = crypto
      .createHash("md5")
      .update(file)
      .digest("hex");

    peers.forEach((peer, i) => {
      const data = [dataHash, chunks[i]];

      this.dialProtocol(peer, "/storeFile/1.0.0", (err, connection) => {
        if (err) throw err;
        pull(pull.values(data), connection);
      });
    });
    this.addMetaData(dataHash);
  }

  async getChunkFromPeer(hash = "*") {
    const files = await globby(`shards/${this._id}_${hash}`);

    return fse.readFile(files[0]);
  }

  async processCommand(command) {
    const args = command.split(" ");
    const fun = args.shift();

    try {
      console.log("RESULT:\n", await this[fun](...args));
    } catch (e) {
      console.log(e);
    }
  }

  async findProviders(hash) {
    const cid = await getCidFromHash(hash);
    return this.contentRouting.findProviders(cid);
  }

  getChunkFromAnotherPeer(peer, hash) {
    const data = [hash];
    return new Promise((resolve, reject) => {
      this.dialProtocol(peer, "/retrieveFile/1.0.0", (err, connection) => {
        if (err) throw err;
        pull(
          pull.values(data),
          connection,
          pull.collect((err, data) => {
            if (err) throw err;
            resolve(data[0]);
          })
        );
      });
    });
  }

  getFileChunksFromPeers(peers, hash) {
    let chunks = peers.map(peer => {
      if (peer.id.toB58String() == this._id) {
        return this.getChunkFromPeer(hash);
      }
      return this.getChunkFromAnotherPeer(peer, hash);
    });
    return Promise.all(chunks);
  }

  async retrieveFile(hash) {
    const providers = await this.findProviders(hash);
    const chunks = await this.getFileChunksFromPeers(providers, hash);
    console.log(chunks);
    console.log(chunks.map(chunk => chunk.toString()));
  }

  js(...js) {
    return eval(js.join(" "));
  }
}

module.exports = { Node };
