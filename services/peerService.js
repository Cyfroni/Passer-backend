const { createNode } = require("../src/node")

async function createPeer() {
  const peer = await createNode({})
  peer.addListeners()
  peer.createServices()
  peer.start()

  return peer
}

async function createPeers(number) {
  const masterPeer = await createPeer()

  for (let i = 0; i < number - 1; ++i) {
    await createPeer()
  }

  console.log(`${number} peer/s created`)

  return masterPeer
}

module.exports = {
  createPeers
}
