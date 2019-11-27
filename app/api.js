const express = require("express")
const cors = require("cors")

module.exports.createApi = function(peer, port = 8030) {
  const app = express()

  app.use(cors())

  app.use(express.json())

  app.get("/api/home", (req, res) => {
    res.send({ greetings: `Hello from ${peer.getId()}` })
  })

  app.get("/api/files", async (req, res) => {
    console.log(req.body)
    const filesMetaData = await peer.getFilesMetaData()
    res.send(filesMetaData)
  })

  app.post("/api/retrieveFile", async (req, res) => {
    console.log(req.body)
    const { hash } = req.body
    const data = await peer.retrieveFile(hash)
    res.send({ data })
  })

  app.post("/api/uploadFile", async (req, res) => {
    console.log(req.body)
    const { name, data } = req.body
    await peer.storeFile(name, data)
    res.send({ name })
  })

  app.listen(port, () => console.log(`Server listening on port ${port}`))
}
