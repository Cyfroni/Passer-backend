const _ = require("underscore")
const CID = require("cids")
const multihashing = require("multihashing-async")

async function getCidFromHash(hash) {
  const mh = await multihashing(Buffer.from(hash), "sha2-256")
  return new CID(1, "dag-pb", mh)
}

module.exports = class DiscoveryService {
  constructor(peer) {
    this.peerBook = peer.peerBook
    this.contentRouting = peer.contentRouting
  }

  async addProvider(hash) {
    const cid = await getCidFromHash(hash)
    await this.contentRouting.provide(cid)
  }

  async findProvider(hash) {
    const cid = await getCidFromHash(hash)
    const providers = await this.contentRouting.findProviders(cid)
    return providers[0]
  }

  getPeersToStore(requiredPeers) {
    const peers = this.peerBook.getAllArray()
    if (peers.length < requiredPeers)
      throw new Error(
        `Not enough connected peers (${peers.length} < ${requiredPeers})`
      )
    return _.sample(peers, requiredPeers)
  }
}
