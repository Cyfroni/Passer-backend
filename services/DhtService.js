module.exports = class DhtService {
  constructor(peer) {
    this.dht = peer.dht
  }

  async getString(key) {
    const k = Buffer.from(key)
    try {
      const v = await this.dht.get(k, { timeout: 1000 })
      // console.log(`GET: (${k},${v})`)
      return v
    } catch (e) {
      // console.log(`GET: (${k}) -> ${e.message}`)
    }
  }

  async putString(key, value) {
    const k = Buffer.from(key)
    const v = Buffer.from(value)
    try {
      await this.dht.put(k, v)
      // console.log(`PUT: (${k},${v})`)
    } catch (e) {
      // console.log(`PUT: (${k},${v}) -> ${e.message}`)
    }
  }

  async getJson(key) {
    const string = await this.getString(key)
    return string ? JSON.parse(string) : {}
  }

  async putJson(key, json) {
    await this.putString(key, JSON.stringify(json))
  }

  async getMetaData(hash) {
    const metaData = await this.getJson("0")
    return hash ? metaData[hash] : metaData
  }

  async addMetaData(hash, meta) {
    const metaData = await this.getMetaData()
    metaData[hash] = meta
    await this.putJson("0", metaData)
  }

  async removeMetaData(hash) {
    const metaData = await this.getMetaData()
    delete metaData[hash]
    await this.putJson("0", metaData)
  }

  async getFileInfo(hash) {
    return await this.getJson(hash)
  }

  async addFileInfo(hash, info) {
    const fileInfo = await this.getFileInfo(hash)
    await this.putFileInfo(hash, { ...fileInfo, ...info })
  }

  async putFileInfo(hash, info) {
    return await this.putJson(hash, info)
  }

  async getFileNameFromHash(hash) {
    const metaData = await this.getMetaData()
    return metaData[hash].fileName
  }
}
