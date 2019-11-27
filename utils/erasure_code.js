const { promisify } = require("es6-promisify")
const ReedSolomon = require("@ronomon/reed-solomon")
ReedSolomon.encode = promisify(ReedSolomon.encode)

const dataShardsQuantity = 8
const parityShardsQuantity = 4
const shardsQuantity = dataShardsQuantity + parityShardsQuantity
const context = ReedSolomon.create(dataShardsQuantity, parityShardsQuantity)

async function repairFile(chunks, corruptedChunks, info) {
  let shardSize = info["shardSize"]

  let buffer = Buffer.alloc(shardSize * dataShardsQuantity)
  let bufferSize = shardSize * dataShardsQuantity

  let parity = Buffer.alloc(shardSize * parityShardsQuantity)
  let paritySize = shardSize * parityShardsQuantity

  let targets = 0
  corruptedChunks.forEach(function(value) {
    targets |= 1 << value
  })

  let sources = 0
  for (let i = 0; i < shardsQuantity; i++) {
    if (targets & (1 << i)) continue
    sources |= 1 << i
  }

  for (let i = 0; i < dataShardsQuantity; i++) {
    let cnk = chunks[i]
    buffer.fill(cnk, shardSize * i, shardSize * (i + 1))
  }

  for (let i = 0; i < parityShardsQuantity; i++) {
    let cnk = chunks[i + dataShardsQuantity]
    parity.fill(cnk, shardSize * i, shardSize * (i + 1))
  }

  await ReedSolomon.encode(
    context,
    sources,
    targets,
    buffer,
    0,
    bufferSize,
    parity,
    0,
    paritySize
  )

  let reconstructed = []
  for (let i = 0; i < dataShardsQuantity; i++) {
    let cnk = buffer.toString("utf-8", shardSize * i, shardSize * (i + 1))
    reconstructed.push(cnk)
  }
  return reconstructed
}

async function createShards(data) {
  let byteLength = Buffer.byteLength(data, "utf8")

  let shard_bytes = byteLength / dataShardsQuantity

  let shardSize = Math.ceil(shard_bytes)
  let padding = 8 - (shardSize % 8)
  shardSize += padding
  let filePadding = shardSize * dataShardsQuantity - byteLength

  let buffer = Buffer.alloc(shardSize * dataShardsQuantity)
  let bufferSize = shardSize * dataShardsQuantity

  let parity = Buffer.alloc(shardSize * parityShardsQuantity)
  let paritySize = shardSize * parityShardsQuantity

  let sources = 0
  for (let i = 0; i < dataShardsQuantity; i++) sources |= 1 << i

  let targets = 0
  for (let i = dataShardsQuantity; i < shardsQuantity; i++) targets |= 1 << i

  buffer.fill(data, 0, byteLength, "utf-8")

  await ReedSolomon.encode(
    context,
    sources,
    targets,
    buffer,
    0,
    bufferSize,
    parity,
    0,
    paritySize
  )

  return {
    buffer,
    parity,
    shardSize,
    filePadding
  }
}

module.exports = {
  createShards,
  repairFile,
  shardsQuantity,
  dataShardsQuantity,
  parityShardsQuantity
}
