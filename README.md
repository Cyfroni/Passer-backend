# Passer

### Usage:

## Docker:

Build:

`start.sh`

Enter docker:

`enter.sh`

## Inside docker

Start first node:

`node index.js`

You will have similar output to:

```console
peer started. listening on addresses:
/ip4/127.0.0.1/tcp/37153/ipfs/QmQSXri8RFXmqnMocwni33fdy1fHYTnwKs5eXSeksJ24Z6
/ip4/192.168.1.125/tcp/37153/ipfs/QmQSXri8RFXmqnMocwni33fdy1fHYTnwKs5eXSeksJ24Z6
/p2p-circuit/ipfs/QmQSXri8RFXmqnMocwni33fdy1fHYTnwKs5eXSeksJ24Z6
/p2p-circuit/ip4/127.0.0.1/tcp/37153/ipfs/QmQSXri8RFXmqnMocwni33fdy1fHYTnwKs5eXSeksJ24Z6
/p2p-circuit/ip4/192.168.1.125/tcp/37153/ipfs/QmQSXri8RFXmqnMocwni33fdy1fHYTnwKs5eXSeksJ24Z6
```

Now every other node connects to the first node:

`node index.js <multiaddr>`

`node index.js /ip4/192.168.1.125/tcp/37153/ipfs/QmQSXri8RFXmqnMocwni33fdy1fHYTnwKs5eXSeksJ24Z6`

The network is now set up and you can query DHT:

`dht put key value`

`dht get key`
