const Libp2p = require("libp2p")
const defaults = require("./config")
const defaultsDeep = require("@nodeutils/defaults-deep")
const _ = require("underscore")

const DhtService = require("../services/DhtService")
const DiscoveryService = require("../services/DiscoveryService")
const FileService = require("../services/FileService")
const CommunicationService = require("../services/CommunicationService")

class Node extends Libp2p {
  constructor(_options) {
    super(defaultsDeep(_options, defaults))
  }

  addListeners() {
    this.on("start", () => {
      console.error("peer start: ", this.getId())
    })

    this.on("stop", () => {
      console.error("peer stop: ", this.getId())
    })

    this.on("error", err => {
      console.error("peer error: ", err)
      throw err
    })

    this.on("peer:connect", peer => {
      // console.log("Connection established to:", peer.id.toB58String())
    })

    this.handle("/storeFile/1.0.0", async (protocolName, connection) => {
      const { hash, data } = await this.communicationService.receiveJson(
        connection
      )
      await this.fileService.storeChunk(hash, data)
      await this.discoveryService.addProvider(hash)
      console.log("Node %s is providing %s", this.getId(), hash)
    })

    this.handle("/retrieveFile/1.0.0", async (protocolName, connection) => {
      const { hash } = await this.communicationService.receiveJson(connection)
      const data = await this.fileService.loadChunk(hash)
      this.communicationService.sendJson(data.toJSON(), connection)
    })

    this.handle("/terminate/1.0.0", async (protocolName, connection) => {
      this.stop()
    })
  }

  createServices() {
    this.dhtService = new DhtService(this)
    this.discoveryService = new DiscoveryService(this)
    this.fileService = new FileService(this)
    this.communicationService = new CommunicationService(this)
  }

  async getFilesMetaData() {
    const metaData = await this.dhtService.getMetaData()
    const files = []
    Object.keys(metaData).forEach(hash => {
      const name = metaData[hash].name
      files.push({ name, hash })
    })
    return files
  }

  async storeFile(name, content) {
    const data = content ? content : await this.fileService.loadFile(name)
    const hash = this.fileService.calculateHash(data)
    const { chunks, ...info } = await this.fileService.createChunks(data)
    const peers = this.discoveryService.getPeers(chunks.length)
    await this.communicationService.storeFile(peers, chunks)
    await this.dhtService.addMetaData(hash, { name })
    await this.dhtService.putFileInfo(hash, {
      hashes: chunks.map(chunk => chunk.hash),
      ...info
    })
    return chunks.length
  }

  async retrieveFile(hash) {
    const { hashes, ...info } = await this.dhtService.getFileInfo(hash)

    const chunks = await Promise.all(
      hashes.map(async hash => {
        const provider = await this.discoveryService.findProvider(hash)
        if (provider) {
          return await this.getChunkFromPeer(provider, hash)
        }
      })
    )

    return await this.fileService.combineChunks(chunks, info)
  }

  async getChunkFromPeer(peer, hash) {
    return this.peerInfo.id.isEqual(peer.id)
      ? this.fileService.loadChunk(hash)
      : await this.communicationService.retrieveChunkFromPeer(peer, hash)
  }

  getId() {
    return this.peerInfo.id.toB58String()
  }

  js(...js) {
    return eval(js.join(" "))
  }

  async meta() {
    return await this.getFilesMetaData()
  }

  async gpeers() {
    const peers = this.discoveryService
      .getPeers()
      .map(peer => peer.id.toB58String())
    console.log(peers)
    return peers.length
  }

  async tpeers(chance) {
    const counter = await Promise.all(
      this.discoveryService.getPeers().map(async peer => {
        if (Math.random() < chance) {
          await this.communicationService.terminatePeer(peer)
          return true
        }
      })
    )
    return counter.filter(e => e).length
  }

  async tpeer(id) {
    const peer = this.discoveryService
      .getPeers()
      .filter(p => p.id.toB58String() === id)[0]

    await this.communicationService.terminatePeer(peer)
  }

  async dhtg(key) {
    return await this.dhtService.getJson(key)
  }
}

const PeerInfo = require("peer-info")
const nextTick = require("async/nextTick")
const promisify = require("promisify-es6")

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
