const { createNode } = require("../src/node")

async function createPeer() {
  const peer = await createNode({})
  await peer.start(() => {
    peer.addListeners()
    peer.createServices()
  })

  console.log("peer started. listening on addresses:", peer.getAddr())

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
