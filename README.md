# Passer

## Docker:

Build:

`start.sh`

Enter docker:

`enter.sh`

## Inside docker

Start:

`node index.js <peerNumber> <mode>`

```
peerNumber - number of peers to start (1 - default)
mode - 0 (interactive mode - default), 1 (api mode)
```

### interactive mode

The network is now set up and you can query DHT:

`dhtPut key value`

`dhtGet key`

You can also store and retrieve files:

`storeFile fileName`

`retrieveFile fileHash`

Hashes are stored in the DHT under key 0:

`dhtGet 0`

### Api

TODO
