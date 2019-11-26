const express = require("express")
const cors = require("cors")

module.exports.createApi = function(peer, port = 8080) {
  const app = express()

  app.use(cors())

  app.use(express.json())

  app.get("/api/home", (req, res) => {
    res.send({ greetings: `Hello from ${peer._id}` })
  })

  app.get("/api/files", async (req, res) => {
    console.log(req.body)
    const metaData = await peer.getMetaData()
    const files = []
    Object.keys(metaData).forEach(hash => {
      const name = metaData[hash].fileName
      files.push({ name, hash })
    })
    res.send(files)
  })

  app.post("/api/retrieveFile", async (req, res) => {
    console.log(req.body)
    const { hash } = req.body
    const name = await peer.getFileNameFromHash(hash)
    const chunks = await peer.retrieveFile(hash)
    const data = chunks.join("")
    res.send({ name, data })
  })

  app.post("/api/uploadFile", async (req, res) => {
    console.log(req.body)
    const { name, data } = req.body
    await peer.storeFile(name, data)
    res.send({ name })
  })

  app.listen(port, () => console.log(`Server listening on port ${port}`))
}
