const globby = require("globby")
const fse = require("fs-extra")
const crypto = require("crypto")
const _ = require("underscore")

const erasureRS = require("../utils/erasure_code")

module.exports = class FileService {
  constructor(peer) {
    this.peerId = peer.peerInfo.id.toB58String()
  }

  async loadFile(path) {
    return await fse.readFile(path, "utf8")
  }

  calculateHash(data) {
    return crypto
      .createHash("md5")
      .update(data)
      .digest("hex")
  }

  getChunkPath(hash) {
    return `chunks/${this.peerId}_${hash}`
  }

  async loadChunk(hash) {
    const files = await globby(this.getChunkPath(hash))
    return fse.readFile(files[0])
  }

  async storeChunk(hash, data) {
    await fse.writeFile(this.getChunkPath(hash), data)
  }

  async createChunks(data) {
    const { buffer, parity, shardSize, ...info } = await erasureRS.createShards(
      data
    )

    const shards = Buffer.concat([buffer, parity])

    const chunks = []
    for (let i = 0; i < erasureRS.shardsQuantity; i++) {
      const chunk = shards.toString("utf-8", shardSize * i, shardSize * (i + 1))
      const hash = this.calculateHash(chunk)
      chunks.push({
        hash,
        data: chunk
      })
    }

    return {
      chunks,
      shardSize,
      ...info
    }
  }

  async combineChunks(chunks, info) {
    let corruptedFile = false
    const corruptedChunks = []

    for (let i = 0; i < erasureRS.shardsQuantity; i++) {
      if (_.isUndefined(chunks[i])) {
        corruptedFile = true
        corruptedChunks.push(i)
      }
    }

    const reconstructed = corruptedFile
      ? await erasureRS.repairFile(chunks, corruptedChunks, info)
      : chunks.slice(0, erasureRS.dataShardsQuantity)

    const file = reconstructed.join("")
    const filePadding = info.filePadding
    return file.slice(0, -filePadding)
  }
}
