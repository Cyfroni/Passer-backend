const rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout
})

async function processCommand(obj, command) {
  const args = command.split(" ")
  const fun = args.shift()

  try {
    console.log("RESULT:\n", await obj[fun](...args))
  } catch (e) {
    console.log(e)
  }
}

function createInterface(obj) {
  rl.setPrompt("command> ")
  rl.prompt()

  rl.on("line", async function(line) {
    await processCommand(obj, line)
    rl.prompt()
  }).on("close", function() {
    process.exit(0)
  })
}

module.exports = { createInterface }
