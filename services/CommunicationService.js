const { promisify } = require("es6-promisify")
const pull = require("pull-stream")
const _ = require("underscore")

module.exports = class CommunicationService {
  constructor(peer) {
    this.dialProtocol = promisify(peer.dialProtocol)
  }

  timeout(ms) {
    return new Promise((resolve, reject) => setTimeout(reject, ms))
  }

  async connect(peer, protocol) {
    try {
      const connection = this.dialProtocol(peer, protocol)
      return await connection //Promise.race([connection, this.timeout(500)])
    } catch (e) {
      console.log(e)
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
}
