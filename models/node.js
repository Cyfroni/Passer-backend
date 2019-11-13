const KadDHT = require("libp2p-kad-dht");
const Libp2p = require("libp2p");
const TCP = require("libp2p-tcp");
const Multiplex = require("libp2p-mplex");
const SECIO = require("libp2p-secio");
const Bootstrap = require("libp2p-bootstrap");
const crypto = require("crypto");
const _ = require("underscore");
const toPull = require("stream-to-pull-stream");
const Readable = require("stream").Readable;
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
  let chunks = [];
  let quantity = Math.ceil(str.length / n);
  for (let i = 0, charsLength = str.length; i < charsLength; i += quantity) {
    chunks.push(str.substring(i, i + quantity));
  }
  return chunks;
}

function sendData(data, connection) {
  let stream = new Readable();
  data.forEach(d => {
    stream.push(d);
  });
  stream.push(null);

  pull(toPull.duplex(stream), connection);
  console.log(`Sent:\n${data}`);
}

async function getCidFromHash(hash) {
  const mh = await multihashing(Buffer.from(hash), "sha2-256");
  return new CID(1, "dag-pb", mh);
}

function getDataFromConnection(connection) {
  const dataReceived = [];
  pull(
    connection,
    pull.collect((err, data) => {
      if (err) throw err;
      dataReceived.push(data);
      console.log(data);
    })
  );
  console.log(`Received:\n${dataReceived}`);
  return dataReceived;
}

class Node extends Libp2p {
  constructor(opts, bootstrap_list) {
    const bootstrap_opts = DEFAULT_OPTS;
    bootstrap_opts.config.peerDiscovery.bootstrap.list = bootstrap_list;
    super(defaultsDeep(opts, bootstrap_opts));
  }

  addListeners() {
    this._id = this.peerInfo.id.toB58String();
    let id = this._id;
    let cRouting = this.contentRouting;

    this.on("error", err => {
      console.error("libp2p error: ", err);
      throw err;
    });

    this.on("peer:connect", peer => {
      console.log("Connection established to:", peer.id.toB58String());
    });

    this.handle("/storeFile/1.0.0", async (protocolName, connection) => {
      const data = getDataFromConnection(connection);

      let num = data[0];
      let hash = data[1].toString();
      let shard = data[2].toString();

      await fse.writeFile(`shards/${id}_${hash}_${num}`, shard);
      console.log("File is created successfully.");

      let cid = getCidFromHash(hash);
      await cRouting.provide(cid);
      console.log("Node %s is providing %s", id, cid.toString());
    });
    this.handle("/retrieveFile/1.0.0", async (protocolName, connection) => {
      let data = getDataFromConnection(connection);

      const fileHash = data[0].toString();

      let chunks = await this.getPeerChunks(fileHash);
      console.log("Chunks:", chunks);

      sendData(chunks, connection);
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

  sendDataToPeer(peer, protocol, data, response = false) {
    let dataReceived;
    this.dialProtocol(peer, protocol, (err, connection) => {
      if (err) throw err;
      sendData(data, connection);
      if (response) dataReceived = getDataFromConnection(connection);
    });
    return dataReceived;
  }

  getPeersToStore() {
    let peers = this.peerBook.getAllArray();
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

    peers.forEach((p, i) => {
      const data = [i.toString(), dataHash, chunks[i]];
      this.sendDataToPeer(p, "/storeFile/1.0.0", data);
    });
    this.addMetaData(dataHash);
  }

  async getPeerChunks(regexp = "") {
    let files = await globby(`shards/${this._id}_${regexp}*`);

    return Promise.all(files.map(file => fse.readFile(file)));
  }

  async processCommand(command) {
    let args = command.split(" ");
    let fun = args.shift();

    try {
      console.log("RESULT:\n", await this[fun](...args));
    } catch (e) {
      console.log(e);
    }
  }

  async findProviders(hash) {
    return this.contentRouting.findProviders(getCidFromHash(hash));
  }

  async retrieveFile(hash) {
    const providers = await this.findProviders(hash);
    let chunks = [];
    providers.forEach(peer => {
      // console.log(p._id);
      const protocol = "/retrieveFile/1.0.0";
      const data = [hash];
      chunks.push(this.sendDataToPeer(peer, protocol, data, true));
    });
    // console.log(chunks);
  }

  js(...js) {
    return eval(js.join(" "));
  }

  async test() {}
}

module.exports = { Node };
