const { createPeers } = require("./services/peerService")
const { createApi } = require("./app/api")
const { createInterface } = require("./utils/interface")

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
  createInterface(masterPeer)
}

start()

// TODO: handle stop
