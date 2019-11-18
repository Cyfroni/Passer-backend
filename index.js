const { createPeers } = require("./peerService")
const { createApi } = require("./api")

const modes = ["interactive", "api"]

function getIntOrDefault(input, def) {
  const val = parseInt(input)
  return val ? val : def
}

const peerNumber = getIntOrDefault(process.argv[2], 1)
const mode = getIntOrDefault(process.argv[3], 0)

console.log(`Running in ${modes[mode]} mode.`)

async function start() {
  const masterPeer = await createPeers(peerNumber)

  if (mode == 1) {
    createApi(masterPeer)
  }
  masterPeer.createInterface()
}

start()

// TODO: handle stop
