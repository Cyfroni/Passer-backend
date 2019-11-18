const Libp2p = require("libp2p")
const TCP = require("libp2p-tcp")
const WS = require("libp2p-websockets")
const SPDY = require("libp2p-spdy")
const MPLEX = require("libp2p-mplex")
const SECIO = require("libp2p-secio")
const MulticastDNS = require("libp2p-mdns")
const DHT = require("libp2p-kad-dht")
const GossipSub = require("libp2p-gossipsub")
const PeerInfo = require("peer-info")
const defaultsDeep = require("@nodeutils/defaults-deep")

const nextTick = require("async/nextTick")
const promisify = require("promisify-es6")

const _ = require("underscore")
const globby = require("globby")
const fse = require("fs-extra")
const pull = require("pull-stream")

const crypto = require("crypto")
const CID = require("cids")
const multihashing = require("multihashing-async")
const ReedSolomon = require("@ronomon/reed-solomon")

const rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout
})

const chunkQuantity = 2

function splitString(str, n) {
  const chunks = []
  const quantity = Math.ceil(str.length / n)
  for (let i = 0, charsLength = str.length; i < charsLength; i += quantity) {
    chunks.push(str.substring(i, i + quantity))
  }
  return chunks
}

async function getCidFromHash(hash) {
  const mh = await multihashing(Buffer.from(hash), "sha2-256")
  return new CID(1, "dag-pb", mh)
}

class Node extends Libp2p {
  constructor(_options) {
    const defaults = {
      // The libp2p modules for this libp2p bundle
      modules: {
        transport: [
          TCP,
          new WS() // It can take instances too!
        ],
        streamMuxer: [SPDY, MPLEX],
        connEncryption: [SECIO],
        peerDiscovery: [MulticastDNS],
        dht: DHT, // DHT enables PeerRouting, ContentRouting and DHT itself components
        pubsub: GossipSub
      },

      // libp2p config options (typically found on a config.json)
      config: {
        // The config object is the part of the config that can go into a file, config.json.
        peerDiscovery: {
          autoDial: true, // Auto connect to discovered peers (limited by ConnectionManager minPeers)
          mdns: {
            // mdns options
            interval: 10000, // ms
            enabled: true
          },
          webrtcStar: {
            // webrtc-star options
            interval: 1000, // ms
            enabled: false
          }
          // .. other discovery module options.
        },
        relay: {
          // Circuit Relay options
          enabled: true,
          hop: {
            enabled: false,
            active: false
          }
        },
        dht: {
          kBucketSize: 20,
          enabled: true,
          randomWalk: {
            enabled: true, // Allows to disable discovery (enabled by default)
            interval: 300e3,
            timeout: 10e3
          }
        },
        pubsub: {
          enabled: true,
          emitSelf: true, // whether the node should emit to self on publish, in the event of the topic being subscribed
          signMessages: true, // if messages should be signed
          strictSigning: true // if message signing should be required
        }
      }
    }

    // overload any defaults of your bundle using https://github.com/nodeutils/defaults-deep
    super(defaultsDeep(_options, defaults))
  }

  createInterface() {
    const it = this
    rl.setPrompt("command> ")
    rl.prompt()

    rl.on("line", async function(line) {
      await it.processCommand(line)
      rl.prompt()
    }).on("close", function() {
      process.exit(0)
    })
  }

  getAddrs() {
    return this.peerInfo.multiaddrs.toArray()
  }
  getAddr() {
    return this.getAddrs()[1].toString()
  }

  addListeners() {
    this._id = this.peerInfo.id.toB58String()
    const id = this._id
    const it = this

    this.on("error", err => {
      console.error("libp2p error: ", err)
      throw err
    })

    this.on("peer:connect", peer => {
      console.log("Connection established to:", peer.id.toB58String())
    })

    this.handle("/storeFile/1.0.0", (protocolName, connection) => {
      pull(
        connection,
        pull.collect(async (err, data) => {
          if (err) throw err

          const hash = data[0].toString()
          const shard = data[1].toString()

          await fse.writeFile(`shards/${id}_${hash}`, shard)
          console.log("File is created successfully.")

          const cid = await getCidFromHash(hash)
          await it.contentRouting.provide(cid)
          console.log("Node %s is providing %s", id, cid.toString())
        })
      )
    })
    this.handle("/retrieveFile/1.0.0", (protocolName, connection) => {
      pull(
        connection,
        pull.collect(async (err, data) => {
          if (err) throw err
          const fileHash = data[0].toString()

          const chunk = await this.getChunkFromPeer(fileHash)
          console.log("Chunk:", chunk)
          pull(pull.values([chunk]), connection)
        })
      )
    })
  }

  async dhtPut(key, value) {
    const k = Buffer.from(key)
    const v = Buffer.from(value)
    try {
      await this.dht.put(k, v)
      console.log(`PUT: (${k},${v})`)
    } catch (e) {
      console.log(`PUT: (${k},${v}) -> ${e.message}`)
    }
  }
  async dhtGet(key) {
    const k = Buffer.from(key)
    try {
      const v = await this.dht.get(k)
      console.log(`GET: (${k},${v})`)
      return v
    } catch (e) {
      console.log(`GET: (${k}) -> ${e.message}`)
    }
  }
  async addMetaData(dataHash, meta) {
    let metaData = await this.dhtGet("0")
    metaData = metaData ? JSON.parse(metaData) : {}
    //metaData.push(hash);
    metaData[dataHash] = meta
    this.dhtPut("0", JSON.stringify(metaData))
  }

  getPeersToStore(requiredPeers) {
    const peers = this.peerBook.getAllArray()
    console.log(`Peers: ${peers}`)
    if (peers.length < requiredPeers)
      throw new Error(
        `Not enough connected peers (${peers.length} < ${requiredPeers})`
      )

    return _.sample(peers, requiredPeers)
  }

  async storeFile(fileName) {
    const file = await fse.readFile(fileName, "utf8")
    console.log(`FILE: ${fileName}\n${file}`)

    var byteLength = Buffer.byteLength(file, "utf8")

    var dataShardsQuantity = 2
    var parityShardsQuantity = 1

    var context = ReedSolomon.create(dataShardsQuantity, parityShardsQuantity)

    var shard_bytes = byteLength / dataShardsQuantity

    var shardSize = Math.ceil(shard_bytes)
    while (shardSize % 8 != 0) {
      shardSize += 1
    }

    var buffer = Buffer.alloc(shardSize * dataShardsQuantity)
    var bufferOffset = 0
    var bufferSize = shardSize * dataShardsQuantity

    var parity = Buffer.alloc(shardSize * parityShardsQuantity)
    var parityOffset = 0
    var paritySize = shardSize * parityShardsQuantity

    var sources = 0
    for (var i = 0; i < dataShardsQuantity; i++) sources |= 1 << i

    var targets = 0
    for (
      var i = dataShardsQuantity;
      i < dataShardsQuantity + parityShardsQuantity;
      i++
    )
      targets |= 1 << i

    buffer.fill(file, bufferOffset + shardSize * 0, byteLength, "utf-8")

    // Encode all parity shards:
    ReedSolomon.encode(
      context,
      sources,
      targets,
      buffer,
      bufferOffset,
      bufferSize,
      parity,
      parityOffset,
      paritySize,
      function(error) {
        if (error) throw error
        // Parity shards now contain parity data.
      }
    )

    const chunks = splitString(file, chunkQuantity)
    const peers = this.getPeersToStore(
      dataShardsQuantity + parityShardsQuantity
    )

    const chunks2 = Buffer.concat([buffer, parity])
    const dataHash = crypto
      .createHash("md5")
      .update(file)
      .digest("hex")

    var shardsOrder = {}
    peers.forEach((peer, i) => {
      var chunk = chunks2.toString(
        "utf-8",
        bufferOffset + shardSize * i,
        bufferOffset + shardSize * (i + 1)
      )
      let chunk_bytes = chunks2.slice(
        bufferOffset + shardSize * i,
        bufferOffset + shardSize * (i + 1)
      )

      const shardHash = crypto
        .createHash("md5")
        .update(chunk)
        .digest("hex")
      const data = [shardHash, chunk_bytes]

      shardsOrder[i] = shardHash
      this.dialProtocol(peer, "/storeFile/1.0.0", (err, connection) => {
        if (err) throw err
        pull(pull.values(data), connection)
      })
    })
    var meta = {
      dataShardsQuantity: dataShardsQuantity,
      parityShardsQuantity: parityShardsQuantity,
      shardsOrder: shardsOrder,
      shardSize: shardSize,
      fileName: fileName,
      byteLength: byteLength
    }
    this.addMetaData(dataHash, meta)
  }

  async getChunkFromPeer(hash = "*") {
    const files = await globby(`shards/${this._id}_${hash}`)

    return fse.readFile(files[0])
  }

  async processCommand(command) {
    const args = command.split(" ")
    const fun = args.shift()

    try {
      console.log("RESULT:\n", await this[fun](...args))
    } catch (e) {
      console.log(e)
    }
  }

  async findProviders(hash) {
    const cid = await getCidFromHash(hash)
    return this.contentRouting.findProviders(cid)
  }

  getChunkFromAnotherPeer(peer, hash) {
    const data = [hash]
    return new Promise((resolve, reject) => {
      this.dialProtocol(peer, "/retrieveFile/1.0.0", (err, connection) => {
        if (err) {
          console.log("ChunkRetrievalError")
        }
        pull(
          pull.values(data),
          connection,
          pull.collect((err2, data) => {
            if (err2) throw err2
            if (err) resolve(Buffer.from("ChunkRetrievalError"))
            else resolve(data[0])
          })
        )
      })
    })
  }

  getFileChunksFromPeers(peers, hash) {
    let chunks = peers.map(peer => {
      console.log("GET CHUNKS FROM PEER: " + peer.id)
      console.log("HASH: " + hash)
      if (peer.id.toB58String() == this._id) {
        return this.getChunkFromPeer(hash)
      }
      var chunk
      try {
        chunk = this.getChunkFromAnotherPeer(peer, hash)
        console.log("Type of chunk: " + typeof chunk)
      } catch (e) {
        chunk = e
        console.log("Type of exception: " + typeof e)
      }
      return chunk
    })
    return Promise.all(chunks)
  }

  async retrieveFile(hash) {
    var corruptedFile = false
    var corrupted_chunks = []
    let fileData = await this.dhtGet("0")
    fileData = JSON.parse(fileData)[hash]
    let dataShards = fileData["dataShardsQuantity"]
    let parityShards = fileData["parityShardsQuantity"]

    let chunks = []
    for (var i = 0; i < dataShards + parityShards; i++) {
      let shardHash = fileData["shardsOrder"][i]
      let providers = await this.findProviders(shardHash)
      console.log(`shardsOrder ${i}, type: ${typeof i}`)
      console.log(`provider: ${providers[0].id.toB58String()}`)
      let chunk = await this.getFileChunksFromPeers(providers, shardHash)
      if (chunk.toString() == "ChunkRetrievalError") {
        corruptedFile = true
        corrupted_chunks.push(i)
      }
      chunks.push(chunk)
    }
    //const providers = await this.findProviders(hash);

    //const chunks = await this.getFileChunksFromPeers(providers, hash);
    if (corruptedFile == true) {
      console.log("File is corrupted, performing erasure coding ...")
      console.log(`Chunks : ${chunks}`)
      chunks = this.repairFile(fileData, chunks, corrupted_chunks)
    } else {
      chunks = chunks.slice(0, dataShards)
    }
    console.log(`These are chunks (file): ${chunks}`)
    //console.log(chunks.map(chunk => chunk.toString()));
  }

  repairFile(fileData, chunks, corrupted_chunks) {
    var byteLength = fileData["byteLength"]

    var dataShardsQuantity = fileData["dataShardsQuantity"]
    var parityShardsQuantity = fileData["parityShardsQuantity"]
    var context = ReedSolomon.create(dataShardsQuantity, parityShardsQuantity)
    var shardSize = fileData["shardSize"]

    var buffer = Buffer.alloc(shardSize * dataShardsQuantity)
    var bufferOffset = 0
    var bufferSize = shardSize * dataShardsQuantity

    var parity = Buffer.alloc(shardSize * parityShardsQuantity)
    var parityOffset = 0
    var paritySize = shardSize * parityShardsQuantity

    var targets = 0
    corrupted_chunks.forEach(function(value) {
      targets |= 1 << value
    })

    var sources = 0
    for (var i = 0; i < dataShardsQuantity + parityShardsQuantity; i++) {
      if (targets & (1 << i)) continue
      sources |= 1 << i
    }

    for (var i = 0; i < dataShardsQuantity; i++) {
      let cnk = chunks[i][0]
      buffer.fill(cnk, bufferOffset + shardSize * i, shardSize)
    }

    for (var i = 0; i < parityShardsQuantity; i++) {
      let cnk = chunks[i + dataShardsQuantity][0]
      parity.fill(cnk, parityOffset + shardSize * i, shardSize)
    }

    // Encode all parity shards:
    ReedSolomon.encode(
      context,
      sources,
      targets,
      buffer,
      bufferOffset,
      bufferSize,
      parity,
      parityOffset,
      paritySize,
      function(error) {
        if (error) throw error
        // Parity shards now contain parity data.
      }
    )

    var reconstructed = []
    for (var i = 0; i < dataShardsQuantity; i++) {
      let cnk = buffer.toString(
        "utf-8",
        bufferOffset + shardSize * i,
        bufferOffset + shardSize * (i + 1)
      )
      reconstructed.push(cnk)
    }
    return reconstructed
  }

  js(...js) {
    return eval(js.join(" "))
  }
}

const createNode = promisify((options, callback) => {
  if (options.peerInfo) {
    return nextTick(callback, null, new Node(options))
  }
  PeerInfo.create((err, peerInfo) => {
    if (err) return callback(err)
    peerInfo.multiaddrs.add("/ip4/0.0.0.0/tcp/0")
    options.peerInfo = peerInfo
    callback(null, new Node(options))
  })
})

module.exports = { Node, createNode }
