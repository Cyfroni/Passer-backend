const express = require("express")
const cors = require("cors")

module.exports.createApi = function(peer, port = 8080) {
  const app = express()

  app.use(cors())

  app.get("/", (req, res) => {
    res.send(`Hello from ${peer._id}`)
  })

  app.listen(port, () => console.log(`Server listening on port ${port}`))
}
