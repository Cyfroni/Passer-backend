const { promisify } = require("es6-promisify")
const pull = require("pull-stream")
const _ = require("underscore")
const Timeout = require("await-timeout")

module.exports = class CommunicationService {
  constructor(peer) {
    this.dialProtocol = promisify(peer.dialProtocol)
  }

  async connect(peer, protocol) {
    try {
      return await Timeout.wrap(
        this.dialProtocol(peer, protocol),
        1000,
        "Connection timeout -> " + peer.id.toB58String()
      )
    } catch (e) {
      console.log(e.message)
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

  async storeFileR(peers, file) {
    const protocol = "/storeFile/1.0.0"
    for await (const peer of peers) {
      const connection = await this.connect(peer, protocol)
      if (connection) {
        this.sendJson(file, connection)
      }
    }
  }
}
