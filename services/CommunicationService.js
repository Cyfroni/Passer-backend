const { promisify } = require("es6-promisify")
const pull = require("pull-stream")
const _ = require("underscore")
const Timeout = require("await-timeout")

module.exports = class CommunicationService {
  constructor(peer) {
    this.dialProtocol = promisify(peer.dialProtocol)
  }

  async connect(peer, protocol) {
    if (peer.isConnected()) {
      return this.dialProtocol(peer, protocol)
    }
  }

  sendJson(json, connection) {
    pull(pull.values([JSON.stringify(json)]), connection)
  }

  receiveJson(connection) {
    return new Promise((resolve, reject) => {
      pull(
        connection,
        pull.collect((err, data) => {
          if (err) reject(err)
          resolve(JSON.parse(data.toString()))
        })
      )
    })
  }

  async storeFile(peers, chunks) {
    const protocol = "/storeFile/1.0.0"
    for await (const [peer, chunk] of _.zip(peers, chunks)) {
      const connection = await this.connect(peer, protocol)
      if (connection) {
        this.sendJson(chunk, connection)
      }
    }
  }

  async retrieveChunkFromPeer(peer, hash) {
    const protocol = "/retrieveFile/1.0.0"
    const connection = await this.connect(peer, protocol)
    if (connection) {
      this.sendJson({ hash }, connection)
      const chunk = await this.receiveJson(connection)

      return Buffer.from(chunk)
    }
  }

  async terminatePeer(peer) {
    const protocol = "/terminate/1.0.0"
    await this.connect(peer, protocol)
  }
}
